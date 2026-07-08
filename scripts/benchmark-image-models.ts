/**
 * Compare image edit models/routes. Run:
 * npx tsx --env-file=.env.local scripts/benchmark-image-models.ts
 */
import OpenAI from "openai";

import { resolveSourceImageFormat } from "../lib/image-format";
import {
  cropTranslatedScreenshot,
  prepareScreenshot,
  bufferToDataUrl,
} from "../lib/prepare-screenshot";
import {
  buildImageGenerationTool,
  PROCESS_IMAGE_INPUT_DETAIL,
  PROCESS_STEP_RESPONSE_MODEL,
} from "../lib/process-step-config";

const PROMPT =
  "Edit this UI screenshot in place. Translate visible UI text to natural Spanish. Keep the full frame, layout, colors, icons, and spacing identical.";

async function loadFixture() {
  const response = await fetch(
    "https://placehold.co/640x400/e2e8f0/1e293b/png?text=Sign+In",
  );
  if (!response.ok) {
    throw new Error(`Fixture download failed (${response.status}).`);
  }

  const bytes = await response.arrayBuffer();
  const sourceFormat = resolveSourceImageFormat("fixture.png", "image/png");
  const prepared = await prepareScreenshot(
    bytes,
    sourceFormat.mime,
    sourceFormat.openAiFormat,
    sourceFormat.storageExtension,
  );

  return prepared;
}

async function benchmarkResponsesRoute(
  openai: OpenAI,
  prepared: Awaited<ReturnType<typeof loadFixture>>,
  model: string,
  quality: "low" | "medium",
) {
  const started = Date.now();
  const imageResponse = await openai.responses.create({
    model: PROCESS_STEP_RESPONSE_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT },
          {
            type: "input_image",
            image_url: bufferToDataUrl(prepared.buffer, prepared.mime),
            detail: PROCESS_IMAGE_INPUT_DETAIL,
          },
        ],
      },
    ],
    tools: [
      {
        ...buildImageGenerationTool(prepared.openAiFormat, prepared.letterbox.size),
        model,
        quality,
      },
    ],
    tool_choice: { type: "image_generation" },
  });

  const imageBase64 = imageResponse.output?.find(
    (item) => item.type === "image_generation_call" && "result" in item && item.result,
  );

  if (!imageBase64 || !("result" in imageBase64) || !imageBase64.result) {
    throw new Error("No image returned");
  }

  await cropTranslatedScreenshot(
    Buffer.from(imageBase64.result, "base64"),
    prepared.letterbox,
    prepared.openAiFormat,
  );

  return (Date.now() - started) / 1000;
}

async function benchmarkDirectEdit(
  openai: OpenAI,
  prepared: Awaited<ReturnType<typeof loadFixture>>,
  model: string,
  quality: "low" | "medium",
) {
  const started = Date.now();
  const result = await openai.images.edit({
    model,
    image: new File([new Uint8Array(prepared.buffer)], "screenshot.png", {
      type: prepared.mime,
    }),
    prompt: PROMPT,
    size: prepared.letterbox.size,
    quality,
    input_fidelity: "low",
  });

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("No image returned");
  }

  await cropTranslatedScreenshot(
    Buffer.from(imageBase64, "base64"),
    prepared.letterbox,
    prepared.openAiFormat,
  );

  return (Date.now() - started) / 1000;
}

async function main() {
  const openai = new OpenAI();
  const prepared = await loadFixture();

  const cases = [
    ["gpt-image-1.5", "low"],
    ["gpt-image-1.5", "medium"],
    ["gpt-image-1", "low"],
    ["gpt-image-1", "medium"],
    ["gpt-image-1-mini", "medium"],
  ] as const;

  console.log(`Canvas: ${prepared.letterbox.size}\n`);

  for (const [model, quality] of cases) {
    for (const route of ["responses", "images.edit"] as const) {
      const label = `${model} @ ${quality} via ${route}`;
      try {
        const seconds =
          route === "responses"
            ? await benchmarkResponsesRoute(openai, prepared, model, quality)
            : await benchmarkDirectEdit(openai, prepared, model, quality);
        console.log(`${label.padEnd(42)} ${seconds.toFixed(1)}s`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${label.padEnd(42)} FAIL: ${message.slice(0, 80)}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
