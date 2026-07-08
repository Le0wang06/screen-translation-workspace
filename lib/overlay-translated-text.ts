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

function fitFontSize(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  weight: UiTextStyle["font_weight"],
) {
  let size = Math.max(8, Math.floor(maxHeight * 0.72));
  const minSize = 8;

  while (size >= minSize) {
    ctx.font = `${weightToken(weight)} ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth - 2) {
      return size;
    }
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
      const colors = await sampleRegionColors(
        imageBuffer,
        imageWidth,
        imageHeight,
        rect.left,
        rect.top,
        rect.width,
        rect.height,
      );
      const family = fontFamily(targetLanguage, block.style.font_weight);
      const fontSize = fitFontSize(
        ctx,
        block.translated_text,
        rect.width,
        rect.height,
        family,
        block.style.font_weight,
      );
      ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
      const textWidth = Math.ceil(ctx.measureText(block.translated_text).width);

      const maskWidth = Math.min(
        imageWidth - rect.left,
        Math.max(rect.width, textWidth + 4),
      );

      return {
        block,
        rect: { ...rect, width: maskWidth },
        colors,
        fontSize,
        family,
        textWidth,
      };
    }),
  );

  for (const { rect, colors } of placements) {
    ctx.fillStyle = colors.background;
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  }

  for (const { block, rect, colors, fontSize, family } of placements) {
    const fg =
      block.style.kind === "link"
        ? block.style.color || "#58a6ff"
        : colors.foreground;

    ctx.fillStyle = fg;
    ctx.font = `${weightToken(block.style.font_weight)} ${fontSize}px ${family}`;
    ctx.textBaseline = "middle";

    const kind = block.style.kind ?? "body";
    const y = rect.top + rect.height / 2;

    if (kind === "button" || block.style.align === "center") {
      ctx.textAlign = "center";
      ctx.fillText(block.translated_text, rect.left + rect.width / 2, y);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(block.translated_text, rect.left + 1, y);
    }

    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}
