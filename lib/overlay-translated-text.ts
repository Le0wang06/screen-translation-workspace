import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { bboxToPixelRect } from "@/lib/refine-ui-blocks";
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

type SampledColors = { background: string; foreground: string };

async function sampleRegionColors(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<SampledColors> {
  const x = Math.round(Math.min(imageWidth - 1, Math.max(0, left)));
  const y = Math.round(Math.min(imageHeight - 1, Math.max(0, top)));
  const w = Math.max(1, Math.round(Math.min(width, imageWidth - x)));
  const h = Math.max(1, Math.round(Math.min(height, imageHeight - y)));

  const { data, info } = await sharp(imageBuffer)
    .extract({ left: x, top: y, width: w, height: h })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: { luma: number; r: number; g: number; b: number }[] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    pixels.push({ luma: 0.2126 * r + 0.7152 * g + 0.0722 * b, r, g, b });
  }

  pixels.sort((a, b) => a.luma - b.luma);
  const bg = pixels[Math.floor(pixels.length * 0.2)] ?? pixels[0];
  const fg = pixels[Math.floor(pixels.length * 0.9)] ?? pixels[pixels.length - 1];

  const toRgb = (p: { r: number; g: number; b: number }) =>
    `rgb(${p.r}, ${p.g}, ${p.b})`;

  return { background: toRgb(bg), foreground: toRgb(fg) };
}

type Kind = NonNullable<UiTextStyle["kind"]>;

// Target glyph size as a fraction of image height, per kind. Font size is
// derived from the element KIND (stable) rather than the model's bbox height
// (noisy), then shrunk to fit the available width.
const KIND_FONT_FRACTION: Record<Kind, number> = {
  heading: 0.046,
  title: 0.032,
  status: 0.03,
  body: 0.026,
  button: 0.028,
  link: 0.028,
};

function targetFontSize(kind: Kind, imageHeight: number) {
  const fraction = KIND_FONT_FRACTION[kind] ?? KIND_FONT_FRACTION.body;
  return Math.max(10, Math.round(fraction * imageHeight));
}

function fitFontSize(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  target: number,
  maxWidth: number,
  fontFamily: string,
  weight: UiTextStyle["font_weight"],
) {
  let size = target;
  const minSize = 9;

  while (size > minSize) {
    ctx.font = `${weightToken(weight)} ${size}px ${fontFamily}`;
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

  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

  const placements = await Promise.all(
    blocks.map(async (block) => {
      const rect = bboxToPixelRect(block, imageWidth, imageHeight);
      const kind = block.style.kind ?? "body";

      const target = targetFontSize(kind, imageHeight);
      const family = fontFamily(targetLanguage, block.style.font_weight);
      // Available width: the located box covers the original (English) extent,
      // which is at least as wide as the shorter translation.
      const availWidth = Math.max(rect.width, target) + 6;
      const fontSize = fitFontSize(
        ctx,
        block.translated_text,
        target,
        availWidth,
        family,
        block.style.font_weight,
      );

      const isRightAction = kind === "button" || kind === "link";

      // The model reports the text top slightly high and with some noise, so
      // the mask is a generous band that extends mostly downward (where the
      // original glyphs actually sit) to fully wipe them.
      const padX = 3;
      const topPad = isRightAction ? 0.5 : 0.4;
      const heightFactor = isRightAction ? 2.9 : 2.5;
      const maskTop = Math.max(0, rect.top - Math.round(fontSize * topPad));
      const maskHeight = Math.min(
        imageHeight - maskTop,
        Math.round(fontSize * heightFactor),
      );

      ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
      const drawnWidth = ctx.measureText(block.translated_text).width;

      let maskLeft: number;
      let maskWidth: number;
      if (isRightAction) {
        // Right-side actions: cover the located box and lean toward the right
        // edge where the original button/link renders.
        maskLeft = Math.max(0, rect.left - padX);
        maskWidth = Math.min(
          imageWidth - maskLeft,
          Math.max(rect.width, drawnWidth) + padX * 3,
        );
      } else if (kind === "heading") {
        // Page title at top-left: cover from the left edge so no stray glyph
        // (e.g. the "O" of Overview) survives.
        maskLeft = 0;
        maskWidth = Math.min(
          imageWidth,
          Math.max(rect.left + rect.width, rect.left + drawnWidth) +
            Math.round(imageWidth * 0.04),
        );
      } else {
        // Left-aligned text: the model often under-measures the original line
        // width, so extend the mask rightward to wipe trailing English. The
        // left column has nothing until the right-action column (~0.66W), so a
        // wider dark band is invisible on the page background.
        maskLeft = Math.max(0, rect.left - padX);
        const coverRight = Math.max(
          rect.left + rect.width,
          rect.left + drawnWidth,
        ) + Math.round(imageWidth * 0.06);
        const rightLimit = Math.round(imageWidth * 0.63);
        maskWidth = Math.min(imageWidth - maskLeft, coverRight) - maskLeft;
        maskWidth = Math.min(maskWidth, rightLimit - maskLeft);
        maskWidth = Math.max(maskWidth, drawnWidth + padX * 2);
      }

      const colors = await sampleRegionColors(
        imageBuffer,
        imageWidth,
        imageHeight,
        maskLeft,
        maskTop,
        maskWidth,
        maskHeight,
      );

      return {
        block,
        kind,
        rect,
        mask: { left: maskLeft, top: maskTop, width: maskWidth, height: maskHeight },
        colors,
        fontSize,
        family,
        drawnWidth,
      };
    }),
  );

  for (const { mask, colors } of placements) {
    ctx.fillStyle = colors.background;
    ctx.fillRect(mask.left, mask.top, mask.width, mask.height);
  }

  // Draw smallest boxes last so dense text wins any overlap.
  const textOrder = [...placements].sort(
    (a, b) => b.mask.width * b.mask.height - a.mask.width * a.mask.height,
  );

  for (const { block, kind, rect, mask, colors, fontSize, family } of textOrder) {
    const isRightAction = kind === "button" || kind === "link";
    const fg =
      kind === "link"
        ? block.style.color || "#58a6ff"
        : kind === "button" || kind === "heading" || kind === "title"
          ? "#e6edf3"
          : colors.foreground;

    ctx.fillStyle = fg;
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
    ctx.textBaseline = "middle";

    // After pixel-row snapping, y is at the true text top for all kinds.
    const centerY = rect.top + Math.round(fontSize * 0.72);

    if (kind === "button" || block.style.align === "center") {
      ctx.textAlign = "center";
      ctx.fillText(block.translated_text, rect.left + rect.width / 2, centerY);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(block.translated_text, rect.left, centerY);
    }
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}
