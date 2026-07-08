import OpenAI from "openai";

import type { ImageOutputFormat } from "@/lib/image-format";
import {
  bufferToDataUrl,
  cropTranslatedScreenshot,
  prepareScreenshot,
} from "@/lib/prepare-screenshot";
import {
  buildImageGenerationTool,
  PLACEHOLDER_STEP_SUMMARY,
  PLACEHOLDER_STEP_TITLE,
  PROCESS_IMAGE_INPUT_DETAIL,
  PROCESS_STEP_RESPONSE_MODEL,
  resolveOutputFormat,
  storageExtensionForFormat,
} from "@/lib/process-step-config";

export type LocalizeScreenshotInput = {
  sourceLanguage?: string | null;
  targetLanguage: string;
  notes?: string | null;
  openAiFormat: ImageOutputFormat;
};

export type LocalizeScreenshotResult = {
  buffer: Buffer;
  title: string;
  summary: string;
  source_language?: string;
};

function buildLocalizationPrompt(
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
) {
  const sourceHint = sourceLanguage
    ? `Source UI language: ${sourceLanguage}.`
    : "Detect the source language from the screenshot.";
  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  return `Edit this UI screenshot in place. Do not redesign or crop the frame.
${sourceHint}
Translate every piece of visible UI text into natural, correct ${targetLanguage}. Spell each word correctly and use real, valid characters — never invent glyphs.
${notesHint}
Keep the full screenshot visible with the exact same layout, colors, backgrounds, icons, spacing, and typography. Only the readable text should change; everything else must look identical to the original.`;
}

function buildMetadataPrompt(targetLanguage: string) {
  return `Return JSON only:
{"title":"short screen title in ${targetLanguage}","summary":"one English sentence about what the user is doing","source_language":"iso code"}`;
}

function extractGeneratedImageBase64(
  output: OpenAI.Responses.Response["output"],
): string | null {
  for (const item of output) {
    if (item.type === "image_generation_call" && item.result) {
      return item.result;
    }
  }
  return null;
}

async function extractStepMetadata(
  openai: OpenAI,
  imageDataUrl: string,
  targetLanguage: string,
): Promise<{ title: string; summary: string; source_language?: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildMetadataPrompt(targetLanguage) },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("empty metadata");
    const parsed = JSON.parse(content) as {
      title?: string;
      summary?: string;
      source_language?: string;
    };
    return {
      title: parsed.title?.trim() || PLACEHOLDER_STEP_TITLE,
      summary: parsed.summary?.trim() || PLACEHOLDER_STEP_SUMMARY,
      source_language: parsed.source_language?.trim(),
    };
  } catch {
    return {
      title: PLACEHOLDER_STEP_TITLE,
      summary: PLACEHOLDER_STEP_SUMMARY,
    };
  }
}

/**
 * Regenerate the screenshot with translated text baked in, letting the OpenAI
 * image model reproduce the original layout, colors, and typography. This is
 * far more robust across arbitrary UI layouts than positional text overlays.
 */
export async function localizeScreenshot(
  openai: OpenAI,
  sourceBuffer: Buffer,
  input: LocalizeScreenshotInput,
): Promise<LocalizeScreenshotResult> {
  const outputFormat = resolveOutputFormat(input.openAiFormat);
  const storageExtension = storageExtensionForFormat(outputFormat);

  const prepared = await prepareScreenshot(
    sourceBuffer,
    "image/png",
    outputFormat,
    storageExtension,
  );
  const imageDataUrl = bufferToDataUrl(prepared.buffer, prepared.mime);

  const [imageResponse, metadata] = await Promise.all([
    openai.responses.create({
      model: PROCESS_STEP_RESPONSE_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildLocalizationPrompt(
                input.sourceLanguage,
                input.targetLanguage,
                input.notes,
              ),
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: PROCESS_IMAGE_INPUT_DETAIL,
            },
          ],
        },
      ],
      tools: [buildImageGenerationTool(outputFormat, prepared.letterbox.size)],
      tool_choice: { type: "image_generation" },
    }),
    extractStepMetadata(openai, imageDataUrl, input.targetLanguage),
  ]);

  const imageBase64 = extractGeneratedImageBase64(imageResponse.output);
  if (!imageBase64) {
    throw new Error("AI did not return a localized screenshot.");
  }

  const buffer = await cropTranslatedScreenshot(
    Buffer.from(imageBase64, "base64"),
    prepared.letterbox,
    outputFormat,
  );

  return {
    buffer,
    title: metadata.title,
    summary: metadata.summary,
    source_language:
      metadata.source_language ?? input.sourceLanguage ?? undefined,
  };
}
