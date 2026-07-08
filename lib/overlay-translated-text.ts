import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { bboxToPixelRect } from "@/lib/refine-ui-blocks";
import type { UiTextBlock, UiTextStyle } from "@/lib/ui-text-types";

let fontsRegistered = false;

function registerOverlayFonts() {
  if (fontsRegistered) {
    return;
  }

  const assetFontDir = path.join(process.cwd(), "assets/fonts");
  const interDir = path.join(process.cwd(), "node_modules/@fontsource/inter/files");
  const notoDir = path.join(
    process.cwd(),
    "node_modules/@fontsource/noto-sans-sc/files",
  );

  const interFromAssets = [
    ["Inter", "Inter-Regular.ttf"],
    ["InterMedium", "Inter-Medium.ttf"],
    ["InterSemiBold", "Inter-SemiBold.ttf"],
  ] as const;

  for (const [family, file] of interFromAssets) {
    const assetPath = path.join(assetFontDir, file);
    if (fs.existsSync(assetPath)) {
      GlobalFonts.registerFromPath(assetPath, family);
    }
  }

  const interWeights = [
    ["Inter", "inter-latin-400-normal.woff"],
    ["InterMedium", "inter-latin-500-normal.woff"],
    ["InterSemiBold", "inter-latin-600-normal.woff"],
  ] as const;

  for (const [family, file] of interWeights) {
    if (!GlobalFonts.has(family)) {
      GlobalFonts.registerFromPath(path.join(interDir, file), family);
    }
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

function weightToken(weight?: UiTextStyle["font_weight"]) {
  if (weight === "bold") return "bold";
  if (weight === "semibold") return "600";
  if (weight === "medium") return "500";
  return "normal";
}

async function sampleBackgroundAtCorners(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const x = Math.min(imageWidth - 1, Math.max(0, left));
  const y = Math.min(imageHeight - 1, Math.max(0, top));
  const w = Math.max(1, Math.min(width, imageWidth - x));
  const h = Math.max(1, Math.min(height, imageHeight - y));

  const points = [
    [x, y],
    [x + w - 1, y],
    [x, y + h - 1],
    [x + w - 1, y + h - 1],
  ];

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (const [x, y] of points) {
    const { data } = await sharp(imageBuffer)
      .extract({ left: x, top: y, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    r += data[0];
    g += data[1];
    b += data[2];
    count += 1;
  }

  return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
}

function fitFontSize(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  weight: UiTextStyle["font_weight"],
) {
  const target = Math.floor(maxHeight * 0.78);
  let low = 8;
  let high = Math.max(9, Math.min(target, 48));
  let best = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    ctx.font = `${weightToken(weight)} ${mid}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth * 0.94 && mid <= maxHeight * 0.9) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function textPosition(
  rect: { left: number; top: number; width: number; height: number },
  align: UiTextStyle["align"],
  kind: UiTextStyle["kind"],
) {
  const insetX = kind === "button" ? 10 : 2;
  const textY = rect.top + rect.height / 2;

  if (align === "center") {
    return { x: rect.left + rect.width / 2, y: textY, align: "center" as const };
  }
  if (align === "right") {
    return {
      x: rect.left + rect.width - insetX,
      y: textY,
      align: "right" as const,
    };
  }
  return { x: rect.left + insetX, y: textY, align: "left" as const };
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

  const rects = blocks.map((block) => {
    const fontFamily = fontFamilyForWeight(targetLanguage, block.style.font_weight);
    const base = bboxToPixelRect(block, imageWidth, imageHeight, { padX: 2, padY: 2 });

    ctx.font = `${weightToken(block.style.font_weight)} ${Math.floor(base.height * 0.78)}px ${fontFamily}`;
    const measured = ctx.measureText(block.translated_text).width;
    const expandRight = Math.max(0, Math.ceil(measured - base.width + 8));

    return bboxToPixelRect(block, imageWidth, imageHeight, {
      padX: 2,
      padY: 2,
      expandRight:
        block.style.align === "left" || (block.style.align ?? "left") === "left"
          ? expandRight
          : 0,
    });
  });

  const backgrounds = await Promise.all(
    rects.map((rect) =>
      sampleBackgroundAtCorners(
        imageBuffer,
        imageWidth,
        imageHeight,
        rect.left,
        rect.top,
        rect.width,
        rect.height,
      ),
    ),
  );

  for (const [index, block] of blocks.entries()) {
    const rect = rects[index];
    const kind = block.style.kind ?? "body";
    const background = backgrounds[index];

    ctx.fillStyle = background;

    if (kind === "button") {
      const radius = Math.min(6, rect.height / 4);
      roundRect(ctx, rect.left, rect.top, rect.width, rect.height, radius);
      ctx.fill();
      ctx.strokeStyle = block.style.color || "#ffffff";
      ctx.lineWidth = 1;
      roundRect(
        ctx,
        rect.left + 0.5,
        rect.top + 0.5,
        rect.width - 1,
        rect.height - 1,
        radius,
      );
      ctx.stroke();
      continue;
    }

    if (kind === "link") {
      ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
      continue;
    }

    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  }

  for (const [index, block] of blocks.entries()) {
    const rect = rects[index];
    const fontFamily = fontFamilyForWeight(targetLanguage, block.style.font_weight);
    const fontSize = fitFontSize(
      ctx,
      block.translated_text,
      rect.width,
      rect.height,
      fontFamily,
      block.style.font_weight,
    );

    ctx.fillStyle = block.style.color || "#ffffff";
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "middle";

    const position = textPosition(rect, block.style.align ?? "left", block.style.kind);
    ctx.textAlign = position.align;
    ctx.fillText(block.translated_text, position.x, position.y);
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
