import OpenAI from "openai";

import type { requireUser } from "@/lib/api/helpers";
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
) {
  const sourceHint = sourceLanguage
    ? `The UI text is in ${sourceLanguage}.`
    : "Detect the source language from the screenshot.";

  return `Recreate this product UI screenshot as a new image.

${sourceHint}
Translate every visible UI label, button, heading, menu item, placeholder, and body text into ${targetLanguage}.

Requirements:
- Keep the same layout, spacing, colors, icons, and overall design.
- Only change readable UI copy into natural ${targetLanguage}.
- Do not add watermarks, borders, or commentary.
- Do not change logos or brand marks unless they contain translatable words.
- Output one polished localized screenshot image.`;
}

function buildMetadataPrompt(targetLanguage: string) {
  return `Look at this product screenshot and return JSON only:
{
  "title": "short screen title in ${targetLanguage}",
  "summary": "one sentence in English describing what the user is doing on this screen",
  "source_language": "iso code"
}`;
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
) {
  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildLocalizationPrompt(sourceLanguage, targetLanguage),
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high",
          },
        ],
      },
    ],
    tools: [
      {
        type: "image_generation",
        action: "edit",
        quality: "high",
      },
    ],
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
            image_url: { url: imageDataUrl },
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
    title: parsed.title?.trim() || "Localized screen",
    summary: parsed.summary?.trim() || "Localized UI screenshot",
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

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mime = file.type || "image/png";
  const imageDataUrl = `data:${mime};base64,${base64}`;

  const openai = getOpenAIClient();
  const [localizedImageBase64, metadata] = await Promise.all([
    generateLocalizedImage(
      openai,
      imageDataUrl,
      input.sourceLanguage,
      input.targetLanguage,
    ),
    extractStepMetadata(openai, imageDataUrl, input.targetLanguage),
  ]);

  const { projectId, flowId } = parseScreenshotStoragePath(input.imagePath);
  const translatedImagePath = localizedScreenshotStoragePath(
    projectId,
    flowId,
    input.stepId,
    "png",
  );

  const localizedBuffer = Buffer.from(localizedImageBase64, "base64");
  const { error: uploadError } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .upload(translatedImagePath, localizedBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const result: ProcessStepResult = {
    title: metadata.title,
    summary: metadata.summary,
    source_language: metadata.source_language ?? input.sourceLanguage ?? undefined,
    target_language: input.targetLanguage,
    translatedImagePath,
  };

  const { error: stepError } = await supabase
    .from("steps")
    .update({
      title: result.title,
      summary: result.summary,
      source_language: result.source_language ?? input.sourceLanguage ?? null,
      target_language: result.target_language,
      translated_image_url: translatedImagePath,
      status: "done",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.stepId);

  if (stepError) {
    throw new Error(stepError.message);
  }

  return result;
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
