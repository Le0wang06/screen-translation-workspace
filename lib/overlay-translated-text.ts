import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import type { UiTextBlock, UiTextStyle } from "@/lib/ui-text-types";

let fontsRegistered = false;

function registerOverlayFonts() {
  if (fontsRegistered) {
    return;
  }

  const interDir = path.join(process.cwd(), "node_modules/@fontsource/inter/files");
  const notoDir = path.join(
    process.cwd(),
    "node_modules/@fontsource/noto-sans-sc/files",
  );

  const interWeights = [
    ["Inter", "400", "inter-latin-400-normal.woff"],
    ["InterMedium", "500", "inter-latin-500-normal.woff"],
    ["InterSemiBold", "600", "inter-latin-600-normal.woff"],
  ] as const;

  for (const [family, , file] of interWeights) {
    GlobalFonts.registerFromPath(path.join(interDir, file), family);
  }

  const notoFile = fs
    .readdirSync(notoDir)
    .find((file) => file.includes("chinese-simplified-400") && file.endsWith(".woff"));

  if (notoFile) {
    GlobalFonts.registerFromPath(path.join(notoDir, notoFile), "NotoSansSC");
  }

  const notoMediumFile = fs
    .readdirSync(notoDir)
    .find((file) => file.includes("chinese-simplified-500") && file.endsWith(".woff"));

  if (notoMediumFile) {
    GlobalFonts.registerFromPath(path.join(notoDir, notoMediumFile), "NotoSansSCMedium");
  }

  fontsRegistered = true;
}

function usesCjk(targetLanguage: string) {
  return /^(zh|ja|ko)/i.test(targetLanguage.trim());
}

function fontFamilyForWeight(targetLanguage: string, weight?: UiTextStyle["font_weight"]) {
  if (usesCjk(targetLanguage)) {
    return weight === "medium" || weight === "semibold" || weight === "bold"
      ? "NotoSansSCMedium"
      : "NotoSansSC";
  }

  if (weight === "semibold" || weight === "bold") {
    return "InterSemiBold";
  }
  if (weight === "medium") {
    return "InterMedium";
  }
  return "Inter";
}

function bboxToPixels(
  block: UiTextBlock,
  imageWidth: number,
  imageHeight: number,
) {
  const padX = 4;
  const padY = 3;

  const left = Math.max(0, Math.floor(block.bbox.x * imageWidth) - padX);
  const top = Math.max(0, Math.floor(block.bbox.y * imageHeight) - padY);
  const width = Math.min(
    imageWidth - left,
    Math.ceil(block.bbox.w * imageWidth) + padX * 2,
  );
  const height = Math.min(
    imageHeight - top,
    Math.ceil(block.bbox.h * imageHeight) + padY * 2,
  );

  return { left, top, width, height };
}

async function sampleBackground(
  imageBuffer: Buffer,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const { data } = await sharp(imageBuffer)
    .extract({
      left,
      top,
      width: Math.max(1, width),
      height: Math.max(1, height),
    })
    .resize(1, 1)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
}

function fitFontSize(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  weight: UiTextStyle["font_weight"],
) {
  const weightToken =
    weight === "bold" ? "bold" : weight === "semibold" ? "600" : weight === "medium" ? "500" : "normal";

  let low = 8;
  let high = Math.max(10, Math.floor(maxHeight * 0.95));
  let best = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    ctx.font = `${weightToken} ${mid}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth * 0.96 && mid <= maxHeight * 0.92) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function renderOrder(block: UiTextBlock) {
  const kindRank: Record<NonNullable<UiTextStyle["kind"]>, number> = {
    body: 0,
    status: 1,
    title: 2,
    heading: 3,
    button: 4,
    link: 5,
  };

  return kindRank[block.style.kind ?? "body"] ?? 0;
}

export async function overlayTranslatedText(
  imageBuffer: Buffer,
  blocks: UiTextBlock[],
  targetLanguage: string,
): Promise<Buffer> {
  registerOverlayFonts();

  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width ?? 1;
  const imageHeight = metadata.height ?? 1;

  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

  const sortedBlocks = [...blocks].sort(
    (left, right) => renderOrder(left) - renderOrder(right),
  );

  const backgrounds = await Promise.all(
    sortedBlocks.map(async (block) => {
      const { left, top, width, height } = bboxToPixels(
        block,
        imageWidth,
        imageHeight,
      );
      const sampled = await sampleBackground(imageBuffer, left, top, width, height);
      return block.style.background || sampled;
    }),
  );

  for (const [index, block] of sortedBlocks.entries()) {
    const { left, top, width, height } = bboxToPixels(
      block,
      imageWidth,
      imageHeight,
    );
    const kind = block.style.kind ?? "body";
    const background = backgrounds[index];

    if (kind !== "link") {
      ctx.fillStyle = background;
      if (kind === "button") {
        const radius = Math.min(8, height / 4);
        roundRect(ctx, left, top, width, height, radius);
        ctx.fill();
        ctx.strokeStyle = block.style.color || "#ffffff";
        ctx.lineWidth = 1;
        roundRect(ctx, left + 0.5, top + 0.5, width - 1, height - 1, radius);
        ctx.stroke();
      } else {
        ctx.fillRect(left, top, width, height);
      }
    } else {
      ctx.fillStyle = background;
      ctx.fillRect(left, top, width, height);
    }
  }

  for (const block of sortedBlocks) {
    const { left, top, width, height } = bboxToPixels(
      block,
      imageWidth,
      imageHeight,
    );
    const fontFamily = fontFamilyForWeight(targetLanguage, block.style.font_weight);
    const fontSize = fitFontSize(
      ctx,
      block.translated_text,
      width,
      height,
      fontFamily,
      block.style.font_weight,
    );

    ctx.fillStyle = block.style.color || "#ffffff";
    ctx.font = `${block.style.font_weight === "bold" ? "bold" : block.style.font_weight === "semibold" ? "600" : block.style.font_weight === "medium" ? "500" : "normal"} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "middle";

    const align = block.style.align ?? "left";
    let textX = left + 6;
    if (align === "center") {
      ctx.textAlign = "center";
      textX = left + width / 2;
    } else if (align === "right") {
      ctx.textAlign = "right";
      textX = left + width - 6;
    } else {
      ctx.textAlign = "left";
    }

    const textY = top + height / 2;
    ctx.fillText(block.translated_text, textX, textY);
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}

function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
