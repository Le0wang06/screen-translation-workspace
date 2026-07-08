/**
 * Ground-truth text-row finder. Computes a horizontal brightness projection
 * over the left text column and prints the y-fraction of each bright band
 * (i.e. where text actually renders). Used to calibrate locate coordinates.
 *
 * Run: npx tsx scripts/analyze-rows.ts <image-path>
 */
import fs from "fs";
import sharp from "sharp";

async function main() {
  const path = process.argv[2];
  const buf = fs.readFileSync(path);
  const img = sharp(buf).rotate().greyscale();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Left text column only (avoid right-side actions).
  const x0 = Math.floor(width * 0.02);
  const x1 = Math.floor(width * 0.45);

  const rowMean: number[] = [];
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let n = 0;
    for (let x = x0; x < x1; x++) {
      sum += data[(y * width + x) * channels];
      n++;
    }
    rowMean.push(sum / n);
  }

  const globalMean = rowMean.reduce((a, b) => a + b, 0) / rowMean.length;
  const threshold = globalMean * 1.15;

  const bands: { top: number; bottom: number; peak: number }[] = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    if (rowMean[y] > threshold) {
      if (start === -1) start = y;
    } else if (start !== -1) {
      if (y - start >= 4) {
        let peak = start;
        for (let k = start; k < y; k++) if (rowMean[k] > rowMean[peak]) peak = k;
        bands.push({ top: start, bottom: y, peak });
      }
      start = -1;
    }
  }

  console.log(`image ${width}x${height}, globalMean ${globalMean.toFixed(1)}`);
  console.log("text bands (y fractions of top / peak / bottom):");
  for (const b of bands) {
    console.log(
      `  top ${(b.top / height).toFixed(3)}  peak ${(b.peak / height).toFixed(3)}  bottom ${(b.bottom / height).toFixed(3)}  (px ${b.top}-${b.bottom})`,
    );
  }
}

main().catch(console.error);
