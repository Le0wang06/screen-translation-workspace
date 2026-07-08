import OpenAI from "openai";

import type { requireUser } from "@/lib/api/helpers";
import { resolveSourceImageFormat } from "@/lib/image-format";
import { localizeScreenshot } from "@/lib/localize-screenshot";
import {
  contentTypeForFormat,
  PLACEHOLDER_STEP_SUMMARY,
  PLACEHOLDER_STEP_TITLE,
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
  const sourceBuffer = Buffer.from(await file.arrayBuffer());

  const openai = getOpenAIClient();
  const localized = await localizeScreenshot(openai, sourceBuffer, {
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    notes: input.notes,
    sourceMime: sourceFormat.mime,
    openAiFormat: outputFormat,
  });

  const { projectId, flowId } = parseScreenshotStoragePath(input.imagePath);
  const translatedImagePath = localizedScreenshotStoragePath(
    projectId,
    flowId,
    input.stepId,
    storageExtension,
  );

  const { error: uploadError } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .upload(translatedImagePath, localized.buffer, {
      contentType: contentTypeForFormat(outputFormat),
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const result: ProcessStepResult = {
    title: localized.title,
    summary: localized.summary,
    source_language: localized.source_language,
    target_language: input.targetLanguage,
    translatedImagePath,
  };

  const { error: updateError } = await supabase
    .from("steps")
    .update({
      title: result.title,
      summary: result.summary,
      source_language: result.source_language ?? input.sourceLanguage ?? null,
      target_language: input.targetLanguage,
      translated_image_url: translatedImagePath,
      status: "done",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.stepId);

  if (updateError) {
    throw new Error(updateError.message);
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

// Re-export placeholders for any legacy imports.
export { PLACEHOLDER_STEP_TITLE, PLACEHOLDER_STEP_SUMMARY };
