import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { loadImagePixels } from "@/lib/image-pixels";
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
  const snapped = snapBlocksToRows(pixels, blocks, imageHeight);

  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

  // Reference text height from plain (non-filled) rows. Buttons/badges report a
  // tight glyph box too, but we size all UI labels off this shared baseline so
  // the imprint stays visually consistent with body text.
  const plainHeights = snapped
    .filter((s) => !s.hasFill)
    .map((s) => s.box.height)
    .sort((a, b) => a - b);
  const baseHeight = plainHeights.length
    ? plainHeights[Math.floor(plainHeights.length / 2)]
    : Math.round(imageHeight * 0.026);

  const placements = snapped.map((snap) => {
    const { block, box, container, background, foreground, hasFill } = snap;
    const family = fontFamily(targetLanguage, block.style.font_weight);
    const kind = block.style.kind ?? "body";

    const center = box.left + box.width / 2;
    const rightAligned =
      block.style.align === "right" ||
      ((kind === "button" || kind === "link" || hasFill) &&
        center > imageWidth * 0.55);

    // Headings/titles are a touch larger; everything else tracks the baseline.
    // Clamp to the measured glyph height so we never inflate a small label.
    const scale = kind === "heading" || kind === "title" ? 1.18 : 1.0;
    const refHeight = Math.min(
      Math.max(box.height, baseHeight * 0.8),
      baseHeight * 1.6,
    );
    const target = Math.round(refHeight * scale * (cjk ? 0.96 : 1.02));

    // Keep text inside its element: buttons clamp to the container interior,
    // plain rows can run to the image edge.
    const inset = hasFill ? 6 : 2;
    const available = rightAligned
      ? (hasFill ? container.left + container.width : box.left + box.width) - inset
      : imageWidth - box.left - inset;
    const minLeft = hasFill ? container.left + inset : 0;

    const fontSize = fitFontSize(
      ctx,
      block.translated_text,
      target,
      available - minLeft,
      family,
      block.style.font_weight,
    );
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
    const textWidth = Math.ceil(ctx.measureText(block.translated_text).width);

    return {
      block,
      box,
      container,
      background,
      foreground,
      family,
      fontSize,
      textWidth,
      rightAligned,
      hasFill,
      kind,
      minLeft,
      available,
    };
  });

  // Pass 1: mask only the original glyphs. For filled elements (buttons) we
  // paint with the element's own fill and stay inside it, so borders and
  // rounded corners survive untouched.
  for (const p of placements) {
    const { box, container, background, textWidth, rightAligned, hasFill } = p;
    // The brightness band only covers the x-height core; ascenders/descenders
    // sit just outside it. Plain rows are on a flat background, so we can mask
    // generously in Y to catch them. Filled elements (buttons) must stay inside
    // the fill so the border and rounded corners survive.
    let maskTop: number;
    let maskBottom: number;
    if (hasFill) {
      maskTop = Math.max(container.top + 2, box.top - 3);
      maskBottom = Math.min(container.top + container.height - 2, box.top + box.height + 3);
    } else {
      maskTop = Math.max(0, box.top - 6);
      maskBottom = Math.min(imageHeight, box.top + box.height + 6);
    }
    const maskHeight = Math.max(1, maskBottom - maskTop);

    const coverWidth = Math.max(box.width, textWidth) + (hasFill ? 4 : 8);
    const leftBound = hasFill ? container.left + 3 : 0;
    const rightBound = hasFill ? container.left + container.width - 3 : imageWidth;

    let maskLeft: number;
    let maskRight: number;
    if (rightAligned) {
      maskRight = Math.min(rightBound, box.left + box.width + (hasFill ? 3 : 6));
      maskLeft = Math.max(leftBound, maskRight - coverWidth);
    } else {
      maskLeft = Math.max(leftBound, box.left - (hasFill ? 3 : 6));
      maskRight = Math.min(rightBound, maskLeft + coverWidth);
    }

    ctx.fillStyle = rgb(background);
    ctx.fillRect(maskLeft, maskTop, Math.max(1, maskRight - maskLeft), maskHeight);
  }

  // Pass 2: draw the translation in the original text color, vertically
  // centered on the element it belongs to.
  for (const p of placements) {
    const { block, box, container, foreground, fontSize, family, rightAligned, hasFill } = p;

    ctx.fillStyle = rgb(foreground);
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
    ctx.textBaseline = "middle";
    const y = hasFill
      ? container.top + container.height / 2
      : box.top + box.height / 2;

    if (rightAligned) {
      ctx.textAlign = "right";
      const right = hasFill ? p.available : box.left + box.width;
      ctx.fillText(block.translated_text, right, y);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(block.translated_text, box.left, y);
    }
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}
