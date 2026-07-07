import OpenAI from "openai";

import type { requireUser } from "@/lib/api/helpers";
import { resolveSourceImageFormat } from "@/lib/image-format";
import {
  bufferToDataUrl,
  prepareScreenshot,
} from "@/lib/prepare-screenshot";
import {
  buildImageGenerationTool,
  contentTypeForFormat,
  PLACEHOLDER_STEP_SUMMARY,
  PLACEHOLDER_STEP_TITLE,
  PROCESS_IMAGE_INPUT_DETAIL,
  PROCESS_STEP_RESPONSE_MODEL,
  resolveOutputFormat,
  storageExtensionForFormat,
} from "@/lib/process-step-config";
import {
  localizedScreenshotStoragePath,
  parseScreenshotStoragePath,
  SCREENSHOTS_BUCKET,
} from "@/lib/storage/screenshots";

type SupabaseClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

export type ProcessStepInput = {
  stepId: string;
  imagePath: string;
  sourceLanguage?: string | null;
  targetLanguage: string;
  notes?: string | null;
};

export type ProcessStepResult = {
  title: string;
  summary: string;
  source_language?: string;
  target_language: string;
  translatedImagePath: string;
};

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({ apiKey });
}

function buildLocalizationPrompt(
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
) {
  const sourceHint = sourceLanguage
    ? `Source UI language: ${sourceLanguage}.`
    : "Detect the source language from the screenshot.";

  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  return `Localize this existing product screenshot with a strict in-place edit. Do not redesign the screen.

${sourceHint}
Replace ONLY visible UI text with natural ${targetLanguage} translations.
${notesHint}
Rules:
- Keep the exact same screenshot: layout, colors, backgrounds, icons, images, spacing, alignment, and typography.
- Do not move, resize, add, or remove UI elements.
- Do not change logos unless they contain translatable words.
- Do not add borders, watermarks, blur, or visual effects.
- The result must look like the original image with translated labels only.`;
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

async function generateLocalizedImage(
  openai: OpenAI,
  imageDataUrl: string,
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  outputFormat: ReturnType<typeof resolveOutputFormat>,
  notes?: string | null,
) {
  const response = await openai.responses.create({
    model: PROCESS_STEP_RESPONSE_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildLocalizationPrompt(sourceLanguage, targetLanguage, notes),
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: PROCESS_IMAGE_INPUT_DETAIL,
          },
        ],
      },
    ],
    tools: [buildImageGenerationTool(outputFormat)],
    tool_choice: { type: "image_generation" },
  });

  const imageBase64 = extractGeneratedImageBase64(response.output);
  if (!imageBase64) {
    throw new Error("AI did not return a localized screenshot.");
  }

  return imageBase64;
}

async function extractStepMetadata(
  openai: OpenAI,
  imageDataUrl: string,
  targetLanguage: string,
) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildMetadataPrompt(targetLanguage) },
          {
            type: "image_url",
            image_url: { url: imageDataUrl, detail: "low" },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty metadata.");
  }

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
}

export async function processStep(
  supabase: SupabaseClient,
  input: ProcessStepInput,
): Promise<ProcessStepResult> {
  const { data: file, error: downloadError } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .download(input.imagePath);

  if (downloadError || !file) {
    throw new Error(downloadError?.message ?? "Failed to download screenshot.");
  }

  const sourceFormat = resolveSourceImageFormat(input.imagePath, file.type);
  const outputFormat = resolveOutputFormat(sourceFormat.openAiFormat);
  const storageExtension = storageExtensionForFormat(outputFormat);

  const prepared = await prepareScreenshot(
    await file.arrayBuffer(),
    sourceFormat.mime,
    sourceFormat.openAiFormat,
    storageExtension,
  );
  const imageDataUrl = bufferToDataUrl(prepared.buffer, prepared.mime);

  const openai = getOpenAIClient();
  const localizedImageBase64 = await generateLocalizedImage(
    openai,
    imageDataUrl,
    input.sourceLanguage,
    input.targetLanguage,
    outputFormat,
    input.notes,
  );

  const { projectId, flowId } = parseScreenshotStoragePath(input.imagePath);
  const translatedImagePath = localizedScreenshotStoragePath(
    projectId,
    flowId,
    input.stepId,
    storageExtension,
  );

  const localizedBuffer = Buffer.from(localizedImageBase64, "base64");
  const { error: uploadError } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .upload(translatedImagePath, localizedBuffer, {
      contentType: contentTypeForFormat(outputFormat),
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const interimResult: ProcessStepResult = {
    title: PLACEHOLDER_STEP_TITLE,
    summary: PLACEHOLDER_STEP_SUMMARY,
    source_language: input.sourceLanguage ?? undefined,
    target_language: input.targetLanguage,
    translatedImagePath,
  };

  const { error: interimUpdateError } = await supabase
    .from("steps")
    .update({
      title: interimResult.title,
      summary: interimResult.summary,
      source_language: input.sourceLanguage ?? null,
      target_language: input.targetLanguage,
      translated_image_url: translatedImagePath,
      status: "done",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.stepId);

  if (interimUpdateError) {
    throw new Error(interimUpdateError.message);
  }

  try {
    const metadata = await extractStepMetadata(
      openai,
      imageDataUrl,
      input.targetLanguage,
    );

    const result: ProcessStepResult = {
      title: metadata.title,
      summary: metadata.summary,
      source_language: metadata.source_language ?? input.sourceLanguage ?? undefined,
      target_language: input.targetLanguage,
      translatedImagePath,
    };

    await supabase
      .from("steps")
      .update({
        title: result.title,
        summary: result.summary,
        source_language: result.source_language ?? input.sourceLanguage ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.stepId);

    return result;
  } catch {
    return interimResult;
  }
}

export async function markStepFailed(
  supabase: SupabaseClient,
  stepId: string,
  message: string,
) {
  await supabase
    .from("steps")
    .update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stepId);
}
