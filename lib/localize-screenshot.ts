import OpenAI, { toFile } from "openai";
import sharp from "sharp";

import type { ImageOutputFormat } from "@/lib/image-format";
import {
  PLACEHOLDER_STEP_SUMMARY,
  PLACEHOLDER_STEP_TITLE,
  PROCESS_IMAGE_MODEL,
  PROCESS_IMAGE_OUTPUT_COMPRESSION,
  PROCESS_IMAGE_QUALITY,
  PROCESS_IMAGE_SIZE_OVERRIDE,
  PROCESS_STEP_METADATA_MODEL,
  resolveOutputFormat,
} from "@/lib/process-step-config";

export type LocalizeScreenshotInput = {
  sourceLanguage?: string | null;
  targetLanguage: string;
  notes?: string | null;
  sourceMime: string;
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

  return `Edit this product UI screenshot in place.
${sourceHint}
Translate every visible UI string into natural, correct ${targetLanguage}.
${notesHint}
Keep the exact same screenshot, layout, controls, icons, colors, spacing, and visual hierarchy. Replace the original text directly inside the same UI elements so it looks native to the screen, not pasted on top.

Rules:
- Translate meaning, not word-for-word.
- Use short product UI copy for buttons, tabs, nav items, labels, and warnings.
- Preserve brand names, product names, numbers, currencies, dates, icons, and non-text graphics.
- Do not invent extra UI, remove UI, crop the frame, add explanations, or leave readable source-language text behind.
- Use real ${targetLanguage} words with correct spelling.`;
}

function buildMetadataPrompt(targetLanguage: string) {
  return `Return JSON only:
{"title":"short screen title in ${targetLanguage}","summary":"one concise sentence in ${targetLanguage} about what the user is doing","source_language":"iso code"}`;
}

function bufferToDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function editableExtensionForMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

async function normalizeForImageEdit(sourceBuffer: Buffer, sourceMime: string) {
  if (
    sourceMime === "image/png" ||
    sourceMime === "image/jpeg" ||
    sourceMime === "image/webp"
  ) {
    return {
      buffer: sourceBuffer,
      mime: sourceMime,
      extension: editableExtensionForMime(sourceMime),
    };
  }

  const buffer = await sharp(sourceBuffer).rotate().png().toBuffer();
  return {
    buffer,
    mime: "image/png",
    extension: "png",
  };
}

function buildMetadataSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      source_language: { type: "string" },
    },
    required: ["title", "summary", "source_language"],
  } as const;
}

function roundToMultipleOf16(value: number) {
  return Math.max(16, Math.round(value / 16) * 16);
}

async function resolveImageEditSize(imageBuffer: Buffer) {
  if (PROCESS_IMAGE_SIZE_OVERRIDE?.trim()) {
    return PROCESS_IMAGE_SIZE_OVERRIDE.trim();
  }

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    return "auto";
  }

  const ratio = width / height;
  if (ratio > 3 || ratio < 1 / 3) {
    return "auto";
  }

  const minPixels = 655_360;
  const maxPixels = 8_294_400;
  const maxEdge = 3_840;
  const pixels = width * height;
  let scale = 1;

  if (pixels < minPixels) {
    scale = Math.sqrt(minPixels / pixels);
  } else if (pixels > maxPixels) {
    scale = Math.sqrt(maxPixels / pixels);
  }

  if (Math.max(width, height) * scale > maxEdge) {
    scale = maxEdge / Math.max(width, height);
  }

  const outputWidth = roundToMultipleOf16(width * scale);
  const outputHeight = roundToMultipleOf16(height * scale);
  const outputPixels = outputWidth * outputHeight;

  if (
    outputPixels < minPixels ||
    outputPixels > maxPixels ||
    Math.max(outputWidth, outputHeight) > maxEdge
  ) {
    return "auto";
  }

  return `${outputWidth}x${outputHeight}`;
}

async function extractStepMetadata(
  openai: OpenAI,
  imageDataUrl: string,
  targetLanguage: string,
): Promise<{ title: string; summary: string; source_language?: string }> {
  try {
    const response = await openai.responses.create({
      model: PROCESS_STEP_METADATA_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: buildMetadataPrompt(targetLanguage) },
            { type: "input_image", image_url: imageDataUrl, detail: "low" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "step_metadata",
          strict: true,
          schema: buildMetadataSchema(),
        },
        verbosity: "low",
      },
    });

    const content = response.output_text;
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
 * image model preserve the original layout while replacing readable UI copy.
 */
export async function localizeScreenshot(
  openai: OpenAI,
  sourceBuffer: Buffer,
  input: LocalizeScreenshotInput,
): Promise<LocalizeScreenshotResult> {
  const outputFormat = resolveOutputFormat(input.openAiFormat);
  const editableImage = await normalizeForImageEdit(sourceBuffer, input.sourceMime);
  const imageSize = await resolveImageEditSize(editableImage.buffer);
  const imageFile = await toFile(
    editableImage.buffer,
    `screenshot.${editableImage.extension}`,
    { type: editableImage.mime },
  );
  const imageDataUrl = bufferToDataUrl(editableImage.buffer, editableImage.mime);

  const imageEditParams = {
    model: PROCESS_IMAGE_MODEL,
    image: imageFile,
    prompt: buildLocalizationPrompt(
      input.sourceLanguage,
      input.targetLanguage,
      input.notes,
    ),
    quality: PROCESS_IMAGE_QUALITY,
    size: imageSize,
    output_format: outputFormat,
    background: "opaque",
    n: 1,
    ...(outputFormat === "jpeg" || outputFormat === "webp"
      ? { output_compression: PROCESS_IMAGE_OUTPUT_COMPRESSION }
      : {}),
  } satisfies Parameters<OpenAI["images"]["edit"]>[0];

  const [imageResponse, metadata] = await Promise.all([
    openai.images.edit(imageEditParams),
    extractStepMetadata(openai, imageDataUrl, input.targetLanguage),
  ]);

  const imageBase64 = imageResponse.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("AI 未返回本地化截图。");
  }

  return {
    buffer: Buffer.from(imageBase64, "base64"),
    title: metadata.title,
    summary: metadata.summary,
    source_language:
      metadata.source_language ?? input.sourceLanguage ?? undefined,
  };
}
