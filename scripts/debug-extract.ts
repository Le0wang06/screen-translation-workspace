import fs from "fs";
import OpenAI from "openai";
import sharp from "sharp";

import { extractUiText } from "../lib/extract-ui-text";
import { bufferToDataUrl } from "../lib/prepare-screenshot";

async function main() {
  const buf = fs.readFileSync(process.argv[2]);
  const img = await sharp(buf)
    .rotate()
    .resize({ width: 1536, withoutEnlargement: true })
    .png()
    .toBuffer();
  const url = bufferToDataUrl(img, "image/png");
  const openai = new OpenAI();
  const result = await extractUiText(openai, url, "en", "zh");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
