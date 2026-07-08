import fs from "fs";
import OpenAI from "openai";
import sharp from "sharp";

import { locateUiText } from "../lib/locate-ui-text";
import { refineUiBlocks } from "../lib/refine-ui-blocks";
import { bufferToDataUrl } from "../lib/prepare-screenshot";

async function main() {
  const buf = fs.readFileSync(process.argv[2]);
  const img = await sharp(buf).rotate().png().toBuffer();
  const meta = await sharp(img).metadata();
  const url = bufferToDataUrl(img, "image/png");
  const openai = new OpenAI();
  const blocks = refineUiBlocks(
    await locateUiText(openai, url, meta.width ?? 1, meta.height ?? 1),
  );
  console.log(JSON.stringify(blocks, null, 2));
}

main().catch(console.error);
