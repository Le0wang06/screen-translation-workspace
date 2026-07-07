import sharp from "sharp";

import type { ImageOutputFormat } from "@/lib/image-format";

export const SCREENSHOT_MAX_WIDTH = 1280;
export const SCREENSHOT_QUALITY = 90;

export type PreparedScreenshot = {
  buffer: Buffer;
  mime: string;
  openAiFormat: ImageOutputFormat;
  storageExtension: string;
  width: number;
  height: number;
};

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

  let output: Buffer;
  let mime = sourceMime;

  switch (openAiFormat) {
    case "jpeg":
      output = await pipeline
        .jpeg({ quality: SCREENSHOT_QUALITY, mozjpeg: true })
        .toBuffer();
      mime = "image/jpeg";
      break;
    case "webp":
      output = await pipeline.webp({ quality: SCREENSHOT_QUALITY }).toBuffer();
      mime = "image/webp";
      break;
    default:
      output = await pipeline.png().toBuffer();
      mime = "image/png";
      break;
  }

  const outputMeta = await sharp(output).metadata();

  return {
    buffer: output,
    mime,
    openAiFormat,
    storageExtension,
    width: outputMeta.width ?? SCREENSHOT_MAX_WIDTH,
    height: outputMeta.height ?? SCREENSHOT_MAX_WIDTH,
  };
}

export function bufferToDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
