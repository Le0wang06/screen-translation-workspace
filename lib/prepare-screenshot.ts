import sharp, { type Sharp } from "sharp";

import type { ImageOutputFormat } from "@/lib/image-format";

export const SCREENSHOT_MAX_WIDTH = 1280;
export const SCREENSHOT_QUALITY = 92;

export type PreparedScreenshot = {
  buffer: Buffer;
  mime: string;
  openAiFormat: ImageOutputFormat;
  storageExtension: string;
  width: number;
  height: number;
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

export async function prepareScreenshot(
  input: Buffer | ArrayBuffer,
  sourceMime: string,
  openAiFormat: ImageOutputFormat,
  storageExtension: string,
): Promise<PreparedScreenshot> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const image = sharp(buffer, { animated: sourceMime === "image/gif" }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? SCREENSHOT_MAX_WIDTH;

  const pipeline =
    width > SCREENSHOT_MAX_WIDTH
      ? image.resize({ width: SCREENSHOT_MAX_WIDTH, withoutEnlargement: true })
      : image;

  const { buffer: output, mime } = await encodeInFormat(pipeline, openAiFormat);
  const outputMeta = await sharp(output).metadata();

  return {
    buffer: output,
    mime,
    openAiFormat,
    storageExtension,
    width: outputMeta.width ?? width,
    height: outputMeta.height ?? width,
  };
}

export function bufferToDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
