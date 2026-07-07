/**
 * OpenAI pipeline smoke test (no Supabase auth required).
 * Run: npx tsx --env-file=.env.local scripts/smoke-openai.ts
 */
import OpenAI from "openai";

import { resolveSourceImageFormat } from "../lib/image-format";
import {
  buildImageGenerationTool,
  PROCESS_IMAGE_INPUT_DETAIL,
  PROCESS_IMAGE_MODEL,
  PROCESS_IMAGE_QUALITY,
  PROCESS_STEP_RESPONSE_MODEL,
} from "../lib/process-step-config";
import { prepareScreenshot, bufferToDataUrl } from "../lib/prepare-screenshot";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  console.log("[smoke] Fetching fixture screenshot…");
  const response = await fetch(
    "https://placehold.co/640x400/e2e8f0/1e293b/png?text=Sign+In",
  );
  if (!response.ok) {
    throw new Error(`Fixture download failed (${response.status}).`);
  }

  const fixtureBytes = await response.arrayBuffer();
  const sourceFormat = resolveSourceImageFormat("fixture.png", "image/png");
  const prepared = await prepareScreenshot(
    fixtureBytes,
    sourceFormat.mime,
    sourceFormat.openAiFormat,
    sourceFormat.storageExtension,
  );
  const imageDataUrl = bufferToDataUrl(prepared.buffer, prepared.mime);

  const openai = new OpenAI({ apiKey });

  console.log("[smoke] Verifying API key…");
  await openai.models.list();

  console.log(
    `[smoke] Pipeline: ${PROCESS_STEP_RESPONSE_MODEL} + ${PROCESS_IMAGE_MODEL} @ ${PROCESS_IMAGE_QUALITY}, output ${prepared.openAiFormat}`,
  );

  const started = Date.now();
  const imageResponse = await openai.responses.create({
    model: PROCESS_STEP_RESPONSE_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Edit this UI screenshot in place. Translate all visible UI text into natural Spanish. Keep layout and design the same.`,
          },
          { type: "input_image", image_url: imageDataUrl, detail: PROCESS_IMAGE_INPUT_DETAIL },
        ],
      },
    ],
    tools: [buildImageGenerationTool(prepared.openAiFormat)],
    tool_choice: { type: "image_generation" },
  });

  const imageBase64 = imageResponse.output?.find(
    (item) => item.type === "image_generation_call" && "result" in item && item.result,
  );

  if (!imageBase64 || !("result" in imageBase64) || !imageBase64.result) {
    throw new Error("OpenAI did not return a localized image.");
  }

  const imageMs = Date.now() - started;
  console.log(`[smoke] Image generated in ${(imageMs / 1000).toFixed(1)}s`);

  const metadataStarted = Date.now();
  const metadataResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Return JSON only: {"title":"short title in Spanish","summary":"one English sentence","source_language":"iso"}`,
          },
          {
            type: "image_url",
            image_url: { url: imageDataUrl, detail: "low" },
          },
        ],
      },
    ],
  });

  const metadata = JSON.parse(
    metadataResponse.choices[0]?.message?.content ?? "{}",
  ) as { title?: string; summary?: string };

  const totalMs = Date.now() - started;
  const metadataMs = Date.now() - metadataStarted;

  console.log("\n✅ OpenAI fast pipeline smoke test passed");
  console.log(`   Format:    ${prepared.openAiFormat} → .${prepared.storageExtension}`);
  console.log(`   Image:     ${(imageMs / 1000).toFixed(1)}s`);
  console.log(`   Metadata:  ${(metadataMs / 1000).toFixed(1)}s`);
  console.log(`   Total:     ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`   Title:     ${metadata.title ?? "(none)"}`);
  console.log(`   Summary:   ${metadata.summary ?? "(none)"}`);
}

main().catch((error) => {
  console.error("\n❌ OpenAI pipeline smoke test failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
