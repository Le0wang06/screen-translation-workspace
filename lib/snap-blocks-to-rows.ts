import type { ImagePixels } from "@/lib/image-pixels";
import type { UiTextBlock } from "@/lib/ui-text-types";

export type TextBand = { top: number; bottom: number; peak: number };

function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Find horizontal text bands in a column slice via a brightness projection.
 * Theme-agnostic: a text row is one whose average luma deviates from the flat
 * local background in EITHER direction (light text on dark, or dark text on
 * light), so it works on both dark and light UIs where OCR fails.
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

  // Background = median row (flat gaps dominate vertically); text rows deviate.
  const bgLevel = median(rowMean);
  const dev = rowMean.map((m) => Math.abs(m - bgLevel));
  const maxDev = Math.max(...dev);
  if (maxDev < 2) return [];
  const threshold = Math.max(2, maxDev * 0.14);

  const bands: TextBand[] = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    if (dev[y] > threshold) {
      if (start === -1) start = y;
    } else if (start !== -1) {
      if (y - start >= 3) {
        let peak = start;
        for (let k = start; k < y; k++) if (dev[k] > dev[peak]) peak = k;
        bands.push({ top: start, bottom: y, peak });
      }
      start = -1;
    }
  }
  if (start !== -1 && height - start >= 3) {
    let peak = start;
    for (let k = start; k < height; k++) if (dev[k] > dev[peak]) peak = k;
    bands.push({ top: start, bottom: height, peak });
  }

  return bands;
}

type Rect = { left: number; top: number; width: number; height: number };
type Color = { r: number; g: number; b: number };

type MeasuredRow = {
  // Tight box around the actual text glyphs.
  box: Rect;
  // The element the text sits on (button rect for buttons, == box otherwise).
  container: Rect;
  // Fill immediately behind the text (button grey, card fill, or page bg).
  background: Color;
  foreground: Color;
  // The text sits on its own filled element distinct from the page background.
  hasFill: boolean;
};

/** Dominant color (mode luma bucket) over a pixel region. */
function dominantColor(
  pixels: ImagePixels,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Color | null {
  const { data, width, channels } = pixels;
  const buckets = new Map<number, { c: number; r: number; g: number; b: number }>();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = Math.round(luma(r, g, b) / 8);
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
  if (!best) return null;
  return {
    r: Math.round(best.r / best.c),
    g: Math.round(best.g / best.c),
    b: Math.round(best.b / best.c),
  };
}

/**
 * Measure a single text row inside a column slice (theme-agnostic):
 *  1. find the content's horizontal extent (columns that deviate from the page
 *     background, in either luma direction),
 *  2. sample the dominant fill inside that extent (button/card fill vs page bg),
 *  3. take the pixels far from that fill as the text ink and tight-box them.
 * This makes button labels report their real glyph size and their fill, so we
 * size the translation correctly and mask without erasing the element.
 */
function measureRow(
  pixels: ImagePixels,
  band: TextBand,
  x0Frac: number,
  x1Frac: number,
): MeasuredRow | null {
  const { data, width, channels } = pixels;
  const x0 = Math.max(0, Math.floor(width * x0Frac));
  const x1 = Math.min(width, Math.ceil(width * x1Frac));
  if (x1 <= x0 || band.bottom <= band.top) return null;

  const at = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };

  // Page background for this row = dominant color across the whole slice band.
  const pageBg = dominantColor(pixels, x0, x1, band.top, band.bottom);
  if (!pageBg) return null;
  const pageLuma = luma(pageBg.r, pageBg.g, pageBg.b);

  // Per-column mean luma across the band, to locate where content actually is.
  const colMean: number[] = [];
  for (let x = x0; x < x1; x++) {
    let sum = 0;
    for (let y = band.top; y < band.bottom; y++) {
      const { r, g, b } = at(x, y);
      sum += luma(r, g, b);
    }
    colMean.push(sum / (band.bottom - band.top));
  }
  const contentDelta = 8;
  let cLeft = -1;
  let cRight = -1;
  for (let i = 0; i < colMean.length; i++) {
    if (Math.abs(colMean[i] - pageLuma) > contentDelta) {
      if (cLeft === -1) cLeft = i;
      cRight = i;
    }
  }
  if (cLeft === -1) return null;
  const contentX0 = x0 + cLeft;
  const contentX1 = x0 + cRight + 1;

  // Dominant fill inside the content extent = button/card fill, or page bg for
  // plain text (where the page bg still dominates between glyphs).
  const fill = dominantColor(pixels, contentX0, contentX1, band.top, band.bottom);
  if (!fill) return null;
  const fillLuma = luma(fill.r, fill.g, fill.b);
  const hasFill = Math.abs(fillLuma - pageLuma) > 14;
  const inkThreshold = 32;

  // Tight box around ink (pixels far from the fill), in both axes.
  let xMin = contentX1;
  let xMax = contentX0;
  let yMin = band.bottom;
  let yMax = band.top;
  const fg = { r: 0, g: 0, b: 0, count: 0 };
  for (let y = band.top; y < band.bottom; y++) {
    for (let x = contentX0; x < contentX1; x++) {
      const { r, g, b } = at(x, y);
      if (Math.abs(luma(r, g, b) - fillLuma) <= inkThreshold) continue;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
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
      top: yMin,
      width: xMax - xMin + 1,
      height: yMax - yMin + 1,
    },
    container: {
      left: contentX0,
      top: band.top,
      width: contentX1 - contentX0,
      height: band.bottom - band.top,
    },
    // Mask with the element fill on buttons/badges, but with the pure page
    // background on plain text so link/label masks stay perfectly invisible.
    background: hasFill ? fill : pageBg,
    foreground: {
      r: Math.round(fg.r / fg.count),
      g: Math.round(fg.g / fg.count),
      b: Math.round(fg.b / fg.count),
    },
    hasFill,
  };
}

export type SnappedBlock = {
  block: UiTextBlock;
  box: Rect;
  container: Rect;
  background: Color;
  foreground: Color;
  // True when the text sits on its own filled element (button/badge), so the
  // mask must preserve that fill and stay inside the element.
  hasFill: boolean;
};

function bboxCenterX(block: UiTextBlock) {
  return block.bbox.x + block.bbox.w / 2;
}

function matchColumn(
  blocks: UiTextBlock[],
  bands: TextBand[],
  pixels: ImagePixels,
  imageHeight: number,
  x0Frac: number,
  x1Frac: number,
): SnappedBlock[] {
  if (blocks.length === 0) return [];

  const sortedBlocks = [...blocks].sort((a, b) => a.bbox.y - b.bbox.y);
  const sortedBands = [...bands].sort((a, b) => a.top - b.top);

  const pairs: { block: UiTextBlock; band: TextBand | null }[] = [];

  if (sortedBands.length > 0 && sortedBlocks.length === sortedBands.length) {
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
      } else {
        pairs.push({ block, band: null });
      }
    }
  }

  const results: SnappedBlock[] = [];
  for (const { block, band } of pairs) {
    if (!band) continue;
    const measured = measureRow(pixels, band, x0Frac, x1Frac);
    if (!measured) continue;
    results.push({
      block,
      box: measured.box,
      container: measured.container,
      background: measured.background,
      foreground: measured.foreground,
      hasFill: measured.hasFill,
    });
  }
  return results;
}

/**
 * Replace vision-estimated positions with pixel-detected text rows. GPT
 * supplies the strings; brightness projection supplies where they actually sit
 * and what they sit on.
 */
export function snapBlocksToRows(
  pixels: ImagePixels,
  blocks: UiTextBlock[],
  imageHeight: number,
): SnappedBlock[] {
  const leftBands = detectTextBands(pixels, 0.01, 0.58);
  const rightBands = detectTextBands(pixels, 0.52, 0.99);

  const leftBlocks = blocks.filter((b) => bboxCenterX(b) < 0.55);
  const rightBlocks = blocks.filter((b) => bboxCenterX(b) >= 0.55);

  const snapped = [
    ...matchColumn(leftBlocks, leftBands, pixels, imageHeight, 0.01, 0.58),
    ...matchColumn(rightBlocks, rightBands, pixels, imageHeight, 0.52, 0.99),
  ];

  return snapped.sort((a, b) => {
    const y = a.box.top - b.box.top;
    if (Math.abs(y) > 3) return y;
    return a.box.left - b.box.left;
  });
}
