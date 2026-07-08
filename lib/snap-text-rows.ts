import sharp from "sharp";

import type { UiTextBlock } from "@/lib/ui-text-types";

type TextBand = { top: number; peak: number; bottom: number };

async function findTextBands(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  xStartFrac: number,
  xEndFrac: number,
): Promise<TextBand[]> {
  const { data, info } = await sharp(imageBuffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const x0 = Math.floor(imageWidth * xStartFrac);
  const x1 = Math.floor(imageWidth * xEndFrac);

  const rowMean: number[] = [];
  for (let y = 0; y < imageHeight; y++) {
    let sum = 0;
    for (let x = x0; x < x1; x++) {
      sum += data[(y * imageWidth + x) * channels];
    }
    rowMean.push(sum / (x1 - x0));
  }

  const globalMean = rowMean.reduce((a, b) => a + b, 0) / rowMean.length;
  const threshold = globalMean * 1.12;

  const bands: TextBand[] = [];
  let start = -1;
  for (let y = 0; y < imageHeight; y++) {
    if (rowMean[y] > threshold) {
      if (start === -1) start = y;
    } else if (start !== -1) {
      if (y - start >= 3) {
        let peak = start;
        for (let k = start; k < y; k++) {
          if (rowMean[k] > rowMean[peak]) peak = k;
        }
        bands.push({ top: start, peak, bottom: y });
      }
      start = -1;
    }
  }

  return bands;
}

/**
 * Snap each block's y to the nearest detected text-band peak in the image.
 * This corrects the systematic ~3-4% vertical offset from GPT-4o vision bboxes
 * using ground-truth pixel brightness, not guessed coefficients.
 */
export async function snapBlocksToImageRows(
  imageBuffer: Buffer,
  blocks: UiTextBlock[],
  imageWidth: number,
  imageHeight: number,
): Promise<UiTextBlock[]> {
  const [leftBands, rightBands] = await Promise.all([
    findTextBands(imageBuffer, imageWidth, imageHeight, 0.02, 0.45),
    findTextBands(imageBuffer, imageWidth, imageHeight, 0.62, 0.98),
  ]);

  const leftPeaks = leftBands.map((b) => b.peak / imageHeight);
  const rightPeaks = rightBands.map((b) => b.peak / imageHeight);

  const snapTo = (currentY: number, peaks: number[]) => {
    let best = currentY;
    let bestDist = Infinity;
    for (const peak of peaks) {
      const dist = Math.abs(peak - currentY);
      if (dist < bestDist && dist < 0.06) {
        bestDist = dist;
        best = peak;
      }
    }
    return bestDist < 0.06 ? best : currentY;
  };

  return blocks.map((block) => {
    const kind = block.style.kind ?? "body";
    const peaks =
      kind === "button" || kind === "link" ? rightPeaks : leftPeaks;
    const snappedY = snapTo(block.bbox.y, peaks);
    if (snappedY === block.bbox.y) return block;
    return { ...block, bbox: { ...block.bbox, y: snappedY } };
  });
}
