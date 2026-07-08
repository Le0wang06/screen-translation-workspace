import fs from "fs";
import OpenAI from "openai";
import sharp from "sharp";

import { extractUiText } from "../lib/extract-ui-text";
import { refineUiBlocks } from "../lib/refine-ui-blocks";
import { bufferToDataUrl } from "../lib/prepare-screenshot";

async function main() {
  const buf = fs.readFileSync(process.argv[2]);
  const img = await sharp(buf).rotate().png().toBuffer();
  const meta = await sharp(img).metadata();
  const url = bufferToDataUrl(img, "image/png");
  const openai = new OpenAI();
  const result = await extractUiText(
    openai,
    url,
    meta.width ?? 1,
    meta.height ?? 1,
    "en",
    "zh",
  );
  const refined = refineUiBlocks(result.blocks);
  console.log(JSON.stringify({ ...result, blocks: refined }, null, 2));
}

main().catch(console.error);
