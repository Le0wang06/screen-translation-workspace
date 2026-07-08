import type { ImagePixels } from "@/lib/refine-text-box";
import type { NormalizedBBox, UiTextBlock } from "@/lib/ui-text-types";

export type TextBand = { top: number; bottom: number; peak: number };

function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Find horizontal text bands in a column slice by brightness projection.
 * Stable on dark UIs where OCR fails.
 */
export function detectTextBands(
  pixels: ImagePixels,
  x0Frac: number,
  x1Frac: number,
): TextBand[] {
  const { data, width, height, channels } = pixels;
  const x0 = Math.max(0, Math.floor(width * x0Frac));
  const x1 = Math.min(width, Math.ceil(width * x1Frac));
  if (x1 <= x0) return [];

  const rowMean: number[] = [];
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let n = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * channels;
      sum += luma(data[i], data[i + 1], data[i + 2]);
      n++;
    }
    rowMean.push(sum / n);
  }

  const globalMean = rowMean.reduce((a, b) => a + b, 0) / rowMean.length;
  const threshold = globalMean * 1.12;

  const bands: TextBand[] = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    if (rowMean[y] > threshold) {
      if (start === -1) start = y;
    } else if (start !== -1) {
      if (y - start >= 3) {
        let peak = start;
        for (let k = start; k < y; k++) {
          if (rowMean[k] > rowMean[peak]) peak = k;
        }
        bands.push({ top: start, bottom: y, peak });
      }
      start = -1;
    }
  }
  if (start !== -1 && height - start >= 3) {
    let peak = start;
    for (let k = start; k < height; k++) {
      if (rowMean[k] > rowMean[peak]) peak = k;
    }
    bands.push({ top: start, bottom: height, peak });
  }

  return bands;
}

type MeasuredRow = {
  box: { left: number; top: number; width: number; height: number };
  background: { r: number; g: number; b: number };
  foreground: { r: number; g: number; b: number };
};

function measureInkInBand(
  pixels: ImagePixels,
  band: TextBand,
  x0Frac: number,
  x1Frac: number,
): MeasuredRow | null {
  const { data, width, height, channels } = pixels;
  const x0 = Math.max(0, Math.floor(width * x0Frac));
  const x1 = Math.min(width, Math.ceil(width * x1Frac));

  const at = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };

  const buckets = new Map<number, { c: number; r: number; g: number; b: number }>();
  for (let y = band.top; y < band.bottom; y++) {
    for (let x = x0; x < x1; x++) {
      const { r, g, b } = at(x, y);
      const key = Math.round(luma(r, g, b) / 8);
      const e = buckets.get(key) ?? { c: 0, r: 0, g: 0, b: 0 };
      e.c++;
      e.r += r;
      e.g += g;
      e.b += b;
      buckets.set(key, e);
    }
  }
  let bg: { c: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!bg || e.c > bg.c) bg = e;
  if (!bg) return null;

  const background = {
    r: Math.round(bg.r / bg.c),
    g: Math.round(bg.g / bg.c),
    b: Math.round(bg.b / bg.c),
  };
  const bgLuma = luma(background.r, background.g, background.b);
  const inkThreshold = 34;

  const isInk = (x: number, y: number) => {
    const { r, g, b } = at(x, y);
    return Math.abs(luma(r, g, b) - bgLuma) > inkThreshold;
  };

  let xMin = x1;
  let xMax = x0;
  const fg = { r: 0, g: 0, b: 0, count: 0 };
  for (let y = band.top; y < band.bottom; y++) {
    for (let x = x0; x < x1; x++) {
      if (!isInk(x, y)) continue;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      const { r, g, b } = at(x, y);
      fg.r += r;
      fg.g += g;
      fg.b += b;
      fg.count++;
    }
  }
  if (xMax < xMin || fg.count === 0) return null;

  return {
    box: {
      left: xMin,
      top: band.top,
      width: xMax - xMin + 1,
      height: band.bottom - band.top,
    },
    background,
    foreground: {
      r: Math.round(fg.r / fg.count),
      g: Math.round(fg.g / fg.count),
      b: Math.round(fg.b / fg.count),
    },
  };
}

function rgbToHex(c: { r: number; g: number; b: number }) {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function toNormalized(
  box: { left: number; top: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): NormalizedBBox {
  return {
    x: box.left / imageWidth,
    y: box.top / imageHeight,
    w: box.width / imageWidth,
    h: box.height / imageHeight,
  };
}

function matchBlocksToBands(
  blocks: UiTextBlock[],
  bands: TextBand[],
  pixels: ImagePixels,
  imageWidth: number,
  imageHeight: number,
  column: "left" | "right",
): UiTextBlock[] {
  if (blocks.length === 0) return [];

  const x0 = column === "left" ? 0.01 : 0.52;
  const x1 = column === "left" ? 0.58 : 0.99;

  const sortedBlocks = [...blocks].sort((a, b) => a.bbox.y - b.bbox.y);
  const sortedBands = [...bands].sort((a, b) => a.top - b.top);

  const pairs: { block: UiTextBlock; band: TextBand }[] = [];

  if (sortedBlocks.length === sortedBands.length) {
    for (let i = 0; i < sortedBlocks.length; i++) {
      pairs.push({ block: sortedBlocks[i], band: sortedBands[i] });
    }
  } else {
    const used = new Set<number>();
    for (const block of sortedBlocks) {
      const centerY = (block.bbox.y + block.bbox.h / 2) * imageHeight;
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < sortedBands.length; i++) {
        if (used.has(i)) continue;
        const band = sortedBands[i];
        const bandCenter = (band.top + band.bottom) / 2;
        const dist = Math.abs(bandCenter - centerY);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      if (best >= 0) {
        used.add(best);
        pairs.push({ block, band: sortedBands[best] });
      }
    }
  }

  return pairs.map(({ block, band }) => {
    const measured = measureInkInBand(pixels, band, x0, x1);
    if (!measured) return block;
    return {
      ...block,
      bbox: toNormalized(measured.box, imageWidth, imageHeight),
      style: {
        ...block.style,
        background: rgbToHex(measured.background),
        color: rgbToHex(measured.foreground),
      },
    };
  });
}

function bboxCenterX(block: UiTextBlock) {
  return block.bbox.x + block.bbox.w / 2;
}

/**
 * Replace vision-estimated Y positions with pixel-detected text rows.
 * GPT supplies the strings; brightness projection supplies where they sit.
 */
export function snapBlocksToRows(
  pixels: ImagePixels,
  blocks: UiTextBlock[],
  imageWidth: number,
  imageHeight: number,
): UiTextBlock[] {
  const leftBands = detectTextBands(pixels, 0.01, 0.58);
  const rightBands = detectTextBands(pixels, 0.52, 0.99);

  const leftBlocks = blocks.filter((b) => bboxCenterX(b) < 0.55);
  const rightBlocks = blocks.filter((b) => bboxCenterX(b) >= 0.55);

  const snapped = [
    ...matchBlocksToBands(leftBlocks, leftBands, pixels, imageWidth, imageHeight, "left"),
    ...matchBlocksToBands(rightBlocks, rightBands, pixels, imageWidth, imageHeight, "right"),
  ];

  return snapped.sort((a, b) => {
    const y = a.bbox.y - b.bbox.y;
    if (Math.abs(y) > 0.005) return y;
    return a.bbox.x - b.bbox.x;
  });
}
