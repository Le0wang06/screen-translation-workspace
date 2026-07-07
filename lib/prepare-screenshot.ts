import sharp from "sharp";

export const SCREENSHOT_MAX_WIDTH = 1024;
export const SCREENSHOT_JPEG_QUALITY = 82;

export type PreparedScreenshot = {
  buffer: Buffer;
  mime: "image/jpeg";
  width: number;
  height: number;
};

export async function prepareScreenshot(
  input: Buffer | ArrayBuffer,
): Promise<PreparedScreenshot> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const image = sharp(buffer).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? SCREENSHOT_MAX_WIDTH;

  const pipeline =
    width > SCREENSHOT_MAX_WIDTH
      ? image.resize({ width: SCREENSHOT_MAX_WIDTH, withoutEnlargement: true })
      : image;

  const output = await pipeline
    .jpeg({ quality: SCREENSHOT_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const outputMeta = await sharp(output).metadata();

  return {
    buffer: output,
    mime: "image/jpeg",
    width: outputMeta.width ?? SCREENSHOT_MAX_WIDTH,
    height: outputMeta.height ?? SCREENSHOT_MAX_WIDTH,
  };
}

export function bufferToDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
