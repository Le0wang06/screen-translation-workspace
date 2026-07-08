import sharp from "sharp";

export type Rgb = { r: number; g: number; b: number };
export type PixelRect = { left: number; top: number; width: number; height: number };

export type ImagePixels = {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
};

export async function loadImagePixels(imageBuffer: Buffer): Promise<ImagePixels> {
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type RefinedBox = {
  box: PixelRect;
  background: Rgb;
  foreground: Rgb;
};

/**
 * Refine a rough (vision-estimated) text rectangle down to the actual text
 * pixels. GPT-4o gives correct text + segmentation but imprecise boxes, so we
 * search a padded region, estimate the flat local background, find the
 * horizontal text band nearest the original center, and measure its true
 * horizontal extent. This yields a tight box that masks align to exactly —
 * fixing vertical drift, oversized fonts, and ghosting. Returns null when no
 * text-like pixels are found (caller falls back to the original rect).
 */
export function refineTextBox(
  pixels: ImagePixels,
  rect: PixelRect,
): RefinedBox | null {
  const { data, width, height, channels } = pixels;

  // Vision boxes are often offset by up to a line, so search generously in Y.
  const padY = Math.round(rect.height * 0.9 + 5);
  const padX = Math.round(rect.height * 0.6 + 8);
  const rx0 = Math.max(0, rect.left - padX);
  const ry0 = Math.max(0, rect.top - padY);
  const rx1 = Math.min(width, rect.left + rect.width + padX);
  const ry1 = Math.min(height, rect.top + rect.height + padY);
  if (rx1 <= rx0 || ry1 <= ry0) return null;

  const at = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };

  // Background = most common luma bucket in the region (the flat UI fill
  // dominates the padded area around a single text element).
  const buckets = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  for (let y = ry0; y < ry1; y++) {
    for (let x = rx0; x < rx1; x++) {
      const { r, g, b } = at(x, y);
      const key = Math.round(luma(r, g, b) / 8);
      const e = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      e.count++;
      e.r += r;
      e.g += g;
      e.b += b;
      buckets.set(key, e);
    }
  }
  let bg: { count: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) {
    if (!bg || e.count > bg.count) bg = e;
  }
  if (!bg) return null;
  const background: Rgb = {
    r: Math.round(bg.r / bg.count),
    g: Math.round(bg.g / bg.count),
    b: Math.round(bg.b / bg.count),
  };
  const bgLuma = luma(background.r, background.g, background.b);
  const inkThreshold = 38;

  const isInk = (x: number, y: number) => {
    const { r, g, b } = at(x, y);
    return Math.abs(luma(r, g, b) - bgLuma) > inkThreshold;
  };

  const regionW = rx1 - rx0;
  const rowInk: number[] = new Array(ry1 - ry0).fill(0);
  for (let y = ry0; y < ry1; y++) {
    let c = 0;
    for (let x = rx0; x < rx1; x++) if (isInk(x, y)) c++;
    rowInk[y - ry0] = c;
  }

  const minRowInk = Math.max(2, Math.floor(regionW * 0.02));
  const bands: { top: number; bottom: number }[] = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i < rowInk.length; i++) {
    if (rowInk[i] >= minRowInk) {
      if (start === -1) start = i;
      gap = 0;
    } else if (start !== -1) {
      gap++;
      if (gap > 3) {
        bands.push({ top: start + ry0, bottom: i - gap + 1 + ry0 });
        start = -1;
        gap = 0;
      }
    }
  }
  if (start !== -1) bands.push({ top: start + ry0, bottom: rowInk.length + ry0 });
  if (bands.length === 0) return null;

  // Pick the text band whose center is nearest the vision box center. Simple
  // and stable: the nearest real row wins even when the box is offset.
  const centerY = rect.top + rect.height / 2;
  let band = bands[0];
  let bestDist = Infinity;
  for (const bnd of bands) {
    if (bnd.bottom - bnd.top < 3) continue;
    const center = (bnd.top + bnd.bottom) / 2;
    const dist = Math.abs(center - centerY);
    if (dist < bestDist) {
      bestDist = dist;
      band = bnd;
    }
  }

  let xMin = rx1;
  let xMax = rx0;
  const fg = { r: 0, g: 0, b: 0, count: 0 };
  for (let y = band.top; y < band.bottom; y++) {
    for (let x = rx0; x < rx1; x++) {
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

  // Re-sample the background from the strips immediately above and below the
  // text band (guaranteed non-text gaps). This matches the true local fill —
  // e.g. a button or card interior — instead of the page background that the
  // region-wide mode can pull in, so masks stay invisible.
  const marginBg = { r: 0, g: 0, b: 0, count: 0 };
  const sampleMargin = (yStart: number, yEnd: number) => {
    for (let y = Math.max(0, yStart); y < Math.min(height, yEnd); y++) {
      for (let x = xMin; x <= xMax; x++) {
        const { r, g, b } = at(x, y);
        if (Math.abs(luma(r, g, b) - bgLuma) > inkThreshold) continue;
        marginBg.r += r;
        marginBg.g += g;
        marginBg.b += b;
        marginBg.count++;
      }
    }
  };
  sampleMargin(band.top - 3, band.top - 1);
  sampleMargin(band.bottom + 1, band.bottom + 3);
  const maskBackground: Rgb =
    marginBg.count > 8
      ? {
          r: Math.round(marginBg.r / marginBg.count),
          g: Math.round(marginBg.g / marginBg.count),
          b: Math.round(marginBg.b / marginBg.count),
        }
      : background;

  return {
    box: {
      left: xMin,
      top: band.top,
      width: xMax - xMin + 1,
      height: band.bottom - band.top,
    },
    background: maskBackground,
    foreground: {
      r: Math.round(fg.r / fg.count),
      g: Math.round(fg.g / fg.count),
      b: Math.round(fg.b / fg.count),
    },
  };
}
