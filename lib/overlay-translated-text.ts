import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
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

  const notoFiles = fs.readdirSync(notoDir);
  for (const [family, weightKey] of [
    ["NotoSansSC", "chinese-simplified-400"],
    ["NotoSansSCMedium", "chinese-simplified-500"],
    ["NotoSansSCSemiBold", "chinese-simplified-600"],
    ["NotoSansSCBold", "chinese-simplified-700"],
  ] as const) {
    const file = notoFiles.find(
      (f) => f.includes(weightKey) && f.endsWith(".woff"),
    );
    if (file) GlobalFonts.registerFromPath(path.join(notoDir, file), family);
  }

  fontsRegistered = true;
}

function usesCjk(lang: string) {
  return /^(zh|ja|ko)/i.test(lang.trim());
}

function fontFamily(lang: string, weight?: UiTextStyle["font_weight"]) {
  if (usesCjk(lang)) {
    if (weight === "bold") return "NotoSansSCBold";
    if (weight === "semibold") return "NotoSansSCSemiBold";
    if (weight === "medium") return "NotoSansSCMedium";
    return "NotoSansSC";
  }
  if (weight === "bold") return "InterSemiBold";
  if (weight === "semibold") return "InterSemiBold";
  if (weight === "medium") return "InterMedium";
  return "Inter";
}

function weightToken(weight?: UiTextStyle["font_weight"]) {
  if (weight === "bold") return "700";
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

// Render everything oversized and downscale with sharp. The extra samples give
// text the same smooth anti-aliasing the native UI has, so it reads as part of
// the screenshot instead of a flat paste.
const SS = 3;

type Align = "left" | "center" | "right";

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

  // Transparent overlay layer at SS resolution. We only draw masks + text here
  // and composite it over the pristine original, so nothing outside the text
  // regions is ever touched.
  const canvas = createCanvas(imageWidth * SS, imageHeight * SS);
  const ctx = canvas.getContext("2d");

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
    // Filled elements (buttons/badges) center their label; right-side links and
    // explicitly right-aligned text hug the right edge; everything else is
    // left-aligned like normal body copy.
    let align: Align;
    if (hasFill) {
      align = "center";
    } else if (block.style.align === "right" || center > imageWidth * 0.55) {
      align = "right";
    } else {
      align = "left";
    }

    // Headings/titles are a touch larger; everything else tracks the baseline.
    // Clamp to the measured glyph height so we never inflate a small label.
    const scale = kind === "heading" || kind === "title" ? 1.15 : 1.0;
    const refHeight = Math.min(
      Math.max(box.height, baseHeight * 0.8),
      baseHeight * 1.6,
    );
    const target = Math.round(refHeight * scale * 1.02);

    // Width the translation is allowed to occupy before we shrink it.
    const inset = hasFill ? 6 : 2;
    let available: number;
    if (align === "center") {
      available = container.width - inset * 2;
    } else if (align === "right") {
      available = hasFill
        ? container.left + container.width - inset
        : box.left + box.width;
    } else {
      available = imageWidth - box.left - inset;
    }

    const fontSize = fitFontSize(
      ctx,
      block.translated_text,
      target,
      available,
      family,
      block.style.font_weight,
    );
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
    const textWidth = ctx.measureText(block.translated_text).width;

    // Where the translation will actually be drawn (image-space, pre-SS).
    let textLeft: number;
    let textRight: number;
    if (align === "center") {
      const cx = container.left + container.width / 2;
      textLeft = cx - textWidth / 2;
      textRight = cx + textWidth / 2;
    } else if (align === "right") {
      const right = hasFill
        ? container.left + container.width - inset
        : box.left + box.width;
      textRight = right;
      textLeft = right - textWidth;
    } else {
      textLeft = box.left;
      textRight = box.left + textWidth;
    }

    return {
      block,
      box,
      container,
      background,
      foreground,
      family,
      fontSize,
      textWidth,
      align,
      hasFill,
      kind,
      textLeft,
      textRight,
    };
  });

  // Pass 1: mask the union of the original glyphs and the new text, so the
  // English is fully hidden and the translation lands on clean background.
  // Filled elements are masked with their own fill, clamped inside the element
  // so borders and rounded corners survive.
  for (const p of placements) {
    const { box, container, background, hasFill, textLeft, textRight } = p;

    let maskTop: number;
    let maskBottom: number;
    if (hasFill) {
      maskTop = Math.max(container.top + 2, box.top - 3);
      maskBottom = Math.min(
        container.top + container.height - 2,
        box.top + box.height + 3,
      );
    } else {
      maskTop = Math.max(0, box.top - 5);
      maskBottom = Math.min(imageHeight, box.top + box.height + 5);
    }

    const leftBound = hasFill ? container.left + 3 : 0;
    const rightBound = hasFill ? container.left + container.width - 3 : imageWidth;
    // Keep the left pad tight on plain rows: card/list borders often sit just a
    // few px left of the text, and a wide mask would erase them into segments.
    const leftPad = hasFill ? 3 : 2;
    const rightPad = hasFill ? 3 : 6;
    const maskLeft = Math.max(leftBound, Math.min(textLeft, box.left) - leftPad);
    const maskRight = Math.min(
      rightBound,
      Math.max(textRight, box.left + box.width) + rightPad,
    );

    ctx.fillStyle = rgb(background);
    ctx.fillRect(
      maskLeft * SS,
      maskTop * SS,
      Math.max(1, maskRight - maskLeft) * SS,
      Math.max(1, maskBottom - maskTop) * SS,
    );
  }

  // Pass 2: draw the translation in the original ink color, vertically centered
  // on the element it belongs to.
  ctx.textBaseline = "middle";
  for (const p of placements) {
    const { block, box, container, foreground, fontSize, family, align, hasFill } = p;

    ctx.fillStyle = rgb(foreground);
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize * SS}px ${family}`;
    const y =
      (hasFill
        ? container.top + container.height / 2
        : box.top + box.height / 2) * SS;

    if (align === "center") {
      ctx.textAlign = "center";
      ctx.fillText(
        block.translated_text,
        (container.left + container.width / 2) * SS,
        y,
      );
    } else if (align === "right") {
      ctx.textAlign = "right";
      ctx.fillText(block.translated_text, p.textRight * SS, y);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(block.translated_text, box.left * SS, y);
    }
  }
  ctx.textAlign = "left";

  // Downscale the overlay layer with a high-quality kernel and lay it over the
  // untouched original.
  const overlayLayer = await sharp(canvas.toBuffer("image/png"))
    .resize(imageWidth, imageHeight, { kernel: "lanczos3" })
    .png()
    .toBuffer();

  return sharp(imageBuffer)
    .composite([{ input: overlayLayer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
