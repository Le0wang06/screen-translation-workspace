import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { loadImagePixels } from "@/lib/refine-text-box";
import type { ImagePixels, Rgb } from "@/lib/refine-text-box";
import { bboxToPixelRect } from "@/lib/refine-ui-blocks";
import { snapBlocksToRows } from "@/lib/snap-blocks-to-rows";
import type { UiTextBlock, UiTextStyle } from "@/lib/ui-text-types";

let fontsRegistered = false;

function registerOverlayFonts() {
  if (fontsRegistered) return;

  const assetFontDir = path.join(process.cwd(), "assets/fonts");
  const interDir = path.join(process.cwd(), "node_modules/@fontsource/inter/files");
  const notoDir = path.join(
    process.cwd(),
    "node_modules/@fontsource/noto-sans-sc/files",
  );

  for (const [family, file] of [
    ["Inter", "Inter-Regular.ttf"],
    ["InterMedium", "Inter-Medium.ttf"],
    ["InterSemiBold", "Inter-SemiBold.ttf"],
  ] as const) {
    const assetPath = path.join(assetFontDir, file);
    if (fs.existsSync(assetPath)) {
      GlobalFonts.registerFromPath(assetPath, family);
    }
  }

  for (const [family, file] of [
    ["Inter", "inter-latin-400-normal.woff"],
    ["InterMedium", "inter-latin-500-normal.woff"],
    ["InterSemiBold", "inter-latin-600-normal.woff"],
  ] as const) {
    if (!GlobalFonts.has(family)) {
      GlobalFonts.registerFromPath(path.join(interDir, file), family);
    }
  }

  const notoFile = fs
    .readdirSync(notoDir)
    .find((f) => f.includes("chinese-simplified-400") && f.endsWith(".woff"));
  if (notoFile) GlobalFonts.registerFromPath(path.join(notoDir, notoFile), "NotoSansSC");

  const notoMedium = fs
    .readdirSync(notoDir)
    .find((f) => f.includes("chinese-simplified-500") && f.endsWith(".woff"));
  if (notoMedium) {
    GlobalFonts.registerFromPath(path.join(notoDir, notoMedium), "NotoSansSCMedium");
  }

  fontsRegistered = true;
}

function usesCjk(lang: string) {
  return /^(zh|ja|ko)/i.test(lang.trim());
}

function fontFamily(lang: string, weight?: UiTextStyle["font_weight"]) {
  if (usesCjk(lang)) {
    return weight === "semibold" || weight === "bold" || weight === "medium"
      ? "NotoSansSCMedium"
      : "NotoSansSC";
  }
  if (weight === "semibold" || weight === "bold") return "InterSemiBold";
  if (weight === "medium") return "InterMedium";
  return "Inter";
}

function weightToken(weight?: UiTextStyle["font_weight"]) {
  if (weight === "bold") return "bold";
  if (weight === "semibold") return "600";
  if (weight === "medium") return "500";
  return "normal";
}

function rgb(c: { r: number; g: number; b: number }) {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

function hexToRgb(hex: string | undefined, fallback: { r: number; g: number; b: number }) {
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Start at the target size (derived from the original text height) and shrink
 * only until the translation fits the available width.
 */
function fitFontSize(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  target: number,
  maxWidth: number,
  family: string,
  weight: UiTextStyle["font_weight"],
) {
  let size = Math.max(9, target);
  const minSize = 8;
  while (size >= minSize) {
    ctx.font = `${weightToken(weight)} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  return minSize;
}

/**
 * Robust local background: the most common luma bucket inside the box. On the
 * flat fills used by real UIs this is the exact background, so masks vanish.
 */
function sampleBackground(
  pixels: ImagePixels,
  box: { left: number; top: number; width: number; height: number },
): Rgb {
  const { data, width, height, channels } = pixels;
  const x0 = Math.max(0, box.left);
  const y0 = Math.max(0, box.top);
  const x1 = Math.min(width, box.left + box.width);
  const y1 = Math.min(height, box.top + box.height);
  const buckets = new Map<number, { c: number; r: number; g: number; b: number }>();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) / 8);
      const e = buckets.get(key) ?? { c: 0, r: 0, g: 0, b: 0 };
      e.c++;
      e.r += r;
      e.g += g;
      e.b += b;
      buckets.set(key, e);
    }
  }
  let best: { c: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.c > best.c) best = e;
  if (!best) return { r: 13, g: 17, b: 23 };
  return {
    r: Math.round(best.r / best.c),
    g: Math.round(best.g / best.c),
    b: Math.round(best.b / best.c),
  };
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
  const cjk = usesCjk(targetLanguage);

  const pixels = await loadImagePixels(imageBuffer);
  const snapped = snapBlocksToRows(pixels, blocks, imageWidth, imageHeight);

  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

  const placements = snapped.map((block) => {
    const box = bboxToPixelRect(block, imageWidth, imageHeight);
    const background = block.style.background
      ? hexToRgb(block.style.background, { r: 13, g: 17, b: 23 })
      : sampleBackground(pixels, box);
    const foreground = hexToRgb(block.style.color, { r: 230, g: 237, b: 243 });
    const family = fontFamily(targetLanguage, block.style.font_weight);

    const center = box.left + box.width / 2;
    const rightAligned =
      block.style.align === "right" ||
      ((block.style.kind === "button" || block.style.kind === "link") &&
        center > imageWidth * 0.6);

    const available =
      (rightAligned ? box.left + box.width : imageWidth - box.left) - 2;
    const target = Math.round(box.height * (cjk ? 0.92 : 0.98));
    const fontSize = fitFontSize(
      ctx,
      block.translated_text,
      target,
      available,
      family,
      block.style.font_weight,
    );
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
    const textWidth = Math.ceil(ctx.measureText(block.translated_text).width);

    return { block, box, background, foreground, family, fontSize, textWidth, rightAligned };
  });

  // Pass 1: mask each original text box with its sampled local background.
  // Vertical padding is generous (invisible on the flat fill) so slight box
  // drift never leaves the original text peeking above or below.
  for (const { box, background, textWidth, rightAligned } of placements) {
    const padY = 4;
    const padX = 3;
    const maskTop = Math.max(0, box.top - padY);
    const maskHeight = Math.min(imageHeight - maskTop, box.height + padY * 2);
    const coverWidth = Math.max(box.width, textWidth + 4);

    let maskLeft: number;
    let maskWidth: number;
    if (rightAligned) {
      const right = Math.min(imageWidth, box.left + box.width + padX);
      maskLeft = Math.max(0, right - coverWidth - padX);
      maskWidth = right - maskLeft;
    } else {
      maskLeft = Math.max(0, box.left - padX);
      maskWidth = Math.min(imageWidth - maskLeft, coverWidth + padX * 2);
    }

    ctx.fillStyle = rgb(background);
    ctx.fillRect(maskLeft, maskTop, maskWidth, maskHeight);
  }

  // Pass 2: draw the translation in the original color at the box center.
  for (const { block, box, foreground, fontSize, family, rightAligned } of placements) {
    const fg =
      block.style.kind === "link" ? block.style.color || "#4493f8" : rgb(foreground);

    ctx.fillStyle = fg;
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
    ctx.textBaseline = "middle";
    const y = box.top + box.height / 2;

    if (rightAligned) {
      ctx.textAlign = "right";
      ctx.fillText(block.translated_text, box.left + box.width, y);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(block.translated_text, box.left, y);
    }
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}
