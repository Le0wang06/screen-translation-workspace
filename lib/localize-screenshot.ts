import OpenAI from "openai";
import sharp from "sharp";

import { extractUiText, MAX_ANALYSIS_WIDTH } from "@/lib/extract-ui-text";
import type { ImageOutputFormat } from "@/lib/image-format";
import { overlayTranslatedText } from "@/lib/overlay-translated-text";
import { bufferToDataUrl } from "@/lib/prepare-screenshot";
import {
  PLACEHOLDER_STEP_SUMMARY,
  PLACEHOLDER_STEP_TITLE,
} from "@/lib/process-step-config";
import type { UiTextBlock } from "@/lib/ui-text-types";

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

async function encodeBuffer(
  buffer: Buffer,
  format: ImageOutputFormat,
): Promise<Buffer> {
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

async function analysisImageDataUrl(imageBuffer: Buffer) {
  const image = sharp(imageBuffer).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? MAX_ANALYSIS_WIDTH;

  const pipeline =
    width > MAX_ANALYSIS_WIDTH
      ? image.resize({ width: MAX_ANALYSIS_WIDTH, withoutEnlargement: true })
      : image;

  const buffer = await pipeline.png().toBuffer();
  return bufferToDataUrl(buffer, "image/png");
}

async function refineBlockStyles(imageBuffer: Buffer, blocks: UiTextBlock[]) {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;

  return Promise.all(
    blocks.map(async (block) => {
      const left = Math.max(0, Math.floor(block.bbox.x * width));
      const top = Math.max(0, Math.floor(block.bbox.y * height));
      const boxWidth = Math.max(1, Math.ceil(block.bbox.w * width));
      const boxHeight = Math.max(1, Math.ceil(block.bbox.h * height));

      const { data: bgSample } = await sharp(imageBuffer)
        .extract({ left, top, width: boxWidth, height: boxHeight })
        .resize(1, 1)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const toHex = (value: number) =>
        Math.round(value).toString(16).padStart(2, "0");
      const bgHex = `#${toHex(bgSample[0])}${toHex(bgSample[1])}${toHex(bgSample[2])}`;

      const isLink = block.style.kind === "link";

      return {
        ...block,
        style: {
          ...block.style,
          background: bgHex,
          color: isLink ? "#58a6ff" : block.style.color,
        },
      };
    }),
  );
}

export async function localizeScreenshot(
  openai: OpenAI,
  sourceBuffer: Buffer,
  input: LocalizeScreenshotInput,
): Promise<LocalizeScreenshotResult> {
  const rotated = await sharp(sourceBuffer).rotate().png().toBuffer();
  const imageDataUrl = await analysisImageDataUrl(rotated);

  const extraction = await extractUiText(
    openai,
    imageDataUrl,
    input.sourceLanguage,
    input.targetLanguage,
    input.notes,
  );

  const styledBlocks = await refineBlockStyles(rotated, extraction.blocks);
  const overlaid = await overlayTranslatedText(
    rotated,
    styledBlocks,
    input.targetLanguage,
  );

  const buffer = await encodeBuffer(overlaid, input.openAiFormat);

  return {
    buffer,
    title: extraction.title || PLACEHOLDER_STEP_TITLE,
    summary: extraction.summary || PLACEHOLDER_STEP_SUMMARY,
    source_language: extraction.source_language ?? input.sourceLanguage ?? undefined,
  };
}
