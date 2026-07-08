import OpenAI from "openai";
import sharp from "sharp";

import type { ImageOutputFormat } from "@/lib/image-format";
import { localizeUiText } from "@/lib/locate-ui-text";
import { overlayTranslatedText } from "@/lib/overlay-translated-text";
import { bufferToDataUrl } from "@/lib/prepare-screenshot";
import {
  PLACEHOLDER_STEP_SUMMARY,
  PLACEHOLDER_STEP_TITLE,
} from "@/lib/process-step-config";
import { refineUiBlocks } from "@/lib/refine-ui-blocks";
import { snapBlocksToImageRows } from "@/lib/snap-text-rows";
import { translateMissingBlocks } from "@/lib/translate-ui-blocks";

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
  debugBlocks?: import("@/lib/ui-text-types").UiTextBlock[];
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
  const debug = process.env.LOCALIZE_DEBUG === "1";
  const mark = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    if (!debug) return fn();
    const t = Date.now();
    const result = await fn();
    console.log(`[localize] ${label}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
    return result;
  };

  const rotated = await sharp(sourceBuffer).rotate().png().toBuffer();
  const metadata = await sharp(rotated).metadata();
  const imageWidth = metadata.width ?? 1;
  const imageHeight = metadata.height ?? 1;
  const imageDataUrl = bufferToDataUrl(rotated, "image/png");

  const localized = await mark("vision", () =>
    localizeUiText(
      openai,
      imageDataUrl,
      imageWidth,
      imageHeight,
      input.targetLanguage,
      input.sourceLanguage,
      input.notes,
    ),
  );

  const snapped = await snapBlocksToImageRows(
    rotated,
    localized.blocks,
    imageWidth,
    imageHeight,
  );

  const refined = refineUiBlocks(snapped);

  const blocks = await mark("translate-fallback", () =>
    translateMissingBlocks(
      openai,
      refined,
      input.targetLanguage,
      input.sourceLanguage,
      input.notes,
    ),
  );

  const overlaid = await mark("overlay", () =>
    overlayTranslatedText(rotated, blocks, input.targetLanguage),
  );

  return {
    buffer: await encodeBuffer(overlaid, input.openAiFormat),
    title: localized.title || PLACEHOLDER_STEP_TITLE,
    summary: localized.summary || PLACEHOLDER_STEP_SUMMARY,
    source_language: localized.source_language ?? input.sourceLanguage ?? undefined,
    debugBlocks: process.env.LOCALIZE_DEBUG === "1" ? blocks : undefined,
  };
}
