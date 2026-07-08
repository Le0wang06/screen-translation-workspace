import sharp, { type Sharp } from "sharp";

import type { ImageOutputFormat } from "@/lib/image-format";
import {
  computeLetterboxPlan,
  type LetterboxPlan,
} from "@/lib/openai-image-size";

export const SCREENSHOT_MAX_DIMENSION = 2048;
export const SCREENSHOT_QUALITY = 92;

export type PreparedScreenshot = {
  buffer: Buffer;
  mime: string;
  openAiFormat: ImageOutputFormat;
  storageExtension: string;
  width: number;
  height: number;
  letterbox: LetterboxPlan;
};

async function encodeInFormat(
  pipeline: Sharp,
  openAiFormat: ImageOutputFormat,
) {
  switch (openAiFormat) {
    case "jpeg":
      return {
        buffer: await pipeline
          .jpeg({ quality: SCREENSHOT_QUALITY, mozjpeg: true })
          .toBuffer(),
        mime: "image/jpeg",
      };
    case "webp":
      return {
        buffer: await pipeline.webp({ quality: SCREENSHOT_QUALITY }).toBuffer(),
        mime: "image/webp",
      };
    default:
      return {
        buffer: await pipeline
          .png({ compressionLevel: 6, palette: false })
          .toBuffer(),
        mime: "image/png",
      };
  }
}

async function sampleBackgroundColor(pipeline: Sharp) {
  const { data } = await pipeline
    .clone()
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    r: data[0] ?? 0,
    g: data[1] ?? 0,
    b: data[2] ?? 0,
    alpha: 255,
  };
}

function maybeDownscale(
  width: number,
  height: number,
): { width: number; height: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= SCREENSHOT_MAX_DIMENSION) {
    return { width, height };
  }

  const scale = SCREENSHOT_MAX_DIMENSION / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function prepareScreenshot(
  input: Buffer | ArrayBuffer,
  sourceMime: string,
  openAiFormat: ImageOutputFormat,
  storageExtension: string,
): Promise<PreparedScreenshot> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const image = sharp(buffer, { animated: sourceMime === "image/gif" }).rotate();
  const metadata = await image.metadata();
  const sourceWidth = metadata.width ?? 1024;
  const sourceHeight = metadata.height ?? 1024;
  const downscaled = maybeDownscale(sourceWidth, sourceHeight);

  const resized = image.resize(downscaled.width, downscaled.height, {
    fit: "inside",
    withoutEnlargement: true,
  });
  const resizedMeta = await resized.metadata();
  const contentWidth = resizedMeta.width ?? downscaled.width;
  const contentHeight = resizedMeta.height ?? downscaled.height;
  const letterbox = computeLetterboxPlan(contentWidth, contentHeight);
  const background = await sampleBackgroundColor(image);

  const pipeline = resized.extend({
    top: letterbox.crop.top,
    bottom:
      letterbox.canvasHeight - letterbox.crop.top - letterbox.crop.height,
    left: letterbox.crop.left,
    right:
      letterbox.canvasWidth - letterbox.crop.left - letterbox.crop.width,
    background,
  });

  const { buffer: output, mime } = await encodeInFormat(pipeline, openAiFormat);

  return {
    buffer: output,
    mime,
    openAiFormat,
    storageExtension,
    width: letterbox.canvasWidth,
    height: letterbox.canvasHeight,
    letterbox,
  };
}

export async function cropTranslatedScreenshot(
  input: Buffer,
  letterbox: LetterboxPlan,
  openAiFormat: ImageOutputFormat,
): Promise<Buffer> {
  const image = sharp(input);
  const metadata = await image.metadata();
  const outputWidth = metadata.width ?? letterbox.canvasWidth;
  const outputHeight = metadata.height ?? letterbox.canvasHeight;

  const scaleX = outputWidth / letterbox.canvasWidth;
  const scaleY = outputHeight / letterbox.canvasHeight;

  const left = Math.round(letterbox.crop.left * scaleX);
  const top = Math.round(letterbox.crop.top * scaleY);
  const width = Math.min(
    outputWidth - left,
    Math.round(letterbox.crop.width * scaleX),
  );
  const height = Math.min(
    outputHeight - top,
    Math.round(letterbox.crop.height * scaleY),
  );

  const { buffer } = await encodeInFormat(
    image.extract({ left, top, width, height }),
    openAiFormat,
  );

  return buffer;
}

export function bufferToDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
