/**
 * OpenAI localization smoke test (no Supabase auth required).
 * Run: npx tsx --env-file=.env.local scripts/smoke-openai.ts
 */
import OpenAI from "openai";
import sharp from "sharp";

import { resolveSourceImageFormat } from "../lib/image-format";
import { localizeScreenshot } from "../lib/localize-screenshot";
import {
  PROCESS_IMAGE_MODEL,
  PROCESS_IMAGE_QUALITY,
  PROCESS_IMAGE_SIZE_OVERRIDE,
  PROCESS_STEP_METADATA_MODEL,
  resolveOutputFormat,
  storageExtensionForFormat,
} from "../lib/process-step-config";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  console.log("[smoke] Fetching fixture screenshot...");
  const response = await fetch(
    "https://placehold.co/640x400/e2e8f0/1e293b/png?text=Sign+In",
  );
  if (!response.ok) {
    throw new Error(`Fixture download failed (${response.status}).`);
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const sourceFormat = resolveSourceImageFormat("fixture.png", "image/png");
  const outputFormat = resolveOutputFormat(sourceFormat.openAiFormat);
  const openai = new OpenAI({ apiKey });

  console.log("[smoke] Verifying API key...");
  await openai.models.list();

  console.log(
    `[smoke] Pipeline: ${PROCESS_IMAGE_MODEL} @ ${PROCESS_IMAGE_QUALITY}, size ${PROCESS_IMAGE_SIZE_OVERRIDE ?? "source-matched"}, metadata ${PROCESS_STEP_METADATA_MODEL}`,
  );

  const started = Date.now();
  const result = await localizeScreenshot(openai, sourceBuffer, {
    sourceLanguage: "en",
    targetLanguage: "Spanish",
    sourceMime: sourceFormat.mime,
    openAiFormat: sourceFormat.openAiFormat,
  });
  const outputMeta = await sharp(result.buffer).metadata();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log("\nOpenAI localization smoke test passed");
  console.log(`   Time:      ${seconds}s`);
  console.log(
    `   Format:    ${sourceFormat.openAiFormat} -> ${outputFormat} (.${storageExtensionForFormat(outputFormat)})`,
  );
  console.log(`   Output:    ${outputMeta.width}x${outputMeta.height}`);
  console.log(`   Title:     ${result.title}`);
  console.log(`   Summary:   ${result.summary}`);
}

main().catch((error) => {
  console.error("\nOpenAI localization smoke test failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
