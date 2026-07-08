import fs from "fs";
import OpenAI from "openai";
import sharp from "sharp";

import { localizeUiText } from "../lib/locate-ui-text";
import { refineUiBlocks } from "../lib/refine-ui-blocks";
import { bufferToDataUrl } from "../lib/prepare-screenshot";

async function main() {
  const path = process.argv[2];
  const buf = fs.readFileSync(path);
  const img = await sharp(buf).rotate().png().toBuffer();
  const meta = await sharp(img).metadata();
  const url = bufferToDataUrl(img, "image/png");
  const openai = new OpenAI();

  const localized = await localizeUiText(
    openai,
    url,
    meta.width ?? 1,
    meta.height ?? 1,
    "zh",
  );
  const blocks = refineUiBlocks(localized.blocks);

  console.log("located", blocks.length, "| title", localized.title);
  for (const block of blocks) {
    console.log(
      `${block.style.kind?.padEnd(8)} [${block.bbox.x.toFixed(3)},${block.bbox.y.toFixed(3)}] ${block.source_text}  ->  ${block.translated_text}`,
    );
  }
}

main().catch(console.error);
