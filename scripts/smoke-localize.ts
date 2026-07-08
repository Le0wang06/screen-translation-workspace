/**
 * Direct image localization smoke test.
 * Run: npx tsx --env-file=.env.local scripts/smoke-localize.ts [image-path]
 */
import fs from "fs";
import OpenAI from "openai";
import path from "path";

import { resolveSourceImageFormat } from "../lib/image-format";
import { localizeScreenshot } from "../lib/localize-screenshot";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const imageArg = process.argv[2];
  const defaultImage =
    "/Users/lw/.cursor/projects/Users-lw-screen-translation-workspace/assets/image-d8d1fca1-a4fb-4690-8d26-469f028e637a.png";
  const imagePath = imageArg ?? defaultImage;

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const sourceBuffer = fs.readFileSync(imagePath);
  const sourceFormat = resolveSourceImageFormat(path.basename(imagePath), "image/png");
  const openai = new OpenAI({ apiKey });

  console.log(`[smoke] Localizing ${imagePath} -> zh with direct image edit`);
  const started = Date.now();

  const result = await localizeScreenshot(openai, sourceBuffer, {
    targetLanguage: "zh",
    sourceMime: sourceFormat.mime,
    openAiFormat: sourceFormat.openAiFormat,
  });

  const outputPath = path.join(process.cwd(), "tmp-localize-smoke.png");
  fs.writeFileSync(outputPath, result.buffer);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log("\nDirect localization smoke test passed");
  console.log(`   Time:    ${seconds}s`);
  console.log(`   Title:   ${result.title}`);
  console.log(`   Summary: ${result.summary}`);
  console.log(`   Output:  ${outputPath}`);
}

main().catch((error) => {
  console.error("\nDirect localization smoke test failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
