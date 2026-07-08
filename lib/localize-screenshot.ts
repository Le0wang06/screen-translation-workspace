import OpenAI from "openai";
import sharp from "sharp";

import type { ImageOutputFormat } from "@/lib/image-format";
import { locateUiText } from "@/lib/locate-ui-text";
import { overlayTranslatedText } from "@/lib/overlay-translated-text";
import { bufferToDataUrl } from "@/lib/prepare-screenshot";
import {
  PLACEHOLDER_STEP_SUMMARY,
  PLACEHOLDER_STEP_TITLE,
} from "@/lib/process-step-config";
import { refineUiBlocks } from "@/lib/refine-ui-blocks";
import { translateLocatedBlocks } from "@/lib/translate-ui-blocks";

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

async function encodeBuffer(buffer: Buffer, format: ImageOutputFormat) {
  const image = sharp(buffer);
  switch (format) {
    case "jpeg":
      return image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    case "webp":
      return image.webp({ quality: 92 }).toBuffer();
    default:
      return image.png({ compressionLevel: 6, palette: false }).toBuffer();
  }
}

export async function localizeScreenshot(
  openai: OpenAI,
  sourceBuffer: Buffer,
  input: LocalizeScreenshotInput,
): Promise<LocalizeScreenshotResult> {
  const rotated = await sharp(sourceBuffer).rotate().png().toBuffer();
  const metadata = await sharp(rotated).metadata();
  const imageWidth = metadata.width ?? 1;
  const imageHeight = metadata.height ?? 1;
  const imageDataUrl = bufferToDataUrl(rotated, "image/png");

  const located = refineUiBlocks(
    await locateUiText(openai, imageDataUrl, imageWidth, imageHeight),
  );

  const translated = await translateLocatedBlocks(
    openai,
    located,
    input.targetLanguage,
    input.sourceLanguage,
    input.notes,
  );

  const overlaid = await overlayTranslatedText(
    rotated,
    translated.blocks,
    input.targetLanguage,
  );

  return {
    buffer: await encodeBuffer(overlaid, input.openAiFormat),
    title: translated.title || PLACEHOLDER_STEP_TITLE,
    summary: translated.summary || PLACEHOLDER_STEP_SUMMARY,
    source_language: translated.source_language ?? input.sourceLanguage ?? undefined,
  };
}
