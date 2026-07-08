/**
 * Image-generation localization smoke test on a local screenshot.
 * Regenerates the screenshot with translated text (the original "perfect"
 * approach) and writes the result so it can be inspected.
 *
 * Run: npx tsx --env-file=.env.local scripts/smoke-imagegen.ts <image-path> [lang]
 */
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";

import { resolveSourceImageFormat } from "../lib/image-format";
import {
  buildImageGenerationTool,
  PROCESS_IMAGE_INPUT_DETAIL,
  PROCESS_IMAGE_MODEL,
  PROCESS_IMAGE_QUALITY,
  PROCESS_STEP_RESPONSE_MODEL,
  resolveOutputFormat,
} from "../lib/process-step-config";
import {
  cropTranslatedScreenshot,
  prepareScreenshot,
  bufferToDataUrl,
} from "../lib/prepare-screenshot";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

  const imagePath = process.argv[2];
  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }
  const targetLanguage = process.argv[3] ?? "zh";

  const sourceFormat = resolveSourceImageFormat(imagePath, "image/png");
  const outputFormat = resolveOutputFormat(sourceFormat.openAiFormat);
  const prepared = await prepareScreenshot(
    fs.readFileSync(imagePath),
    sourceFormat.mime,
    sourceFormat.openAiFormat,
    sourceFormat.storageExtension,
  );
  const imageDataUrl = bufferToDataUrl(prepared.buffer, prepared.mime);

  const openai = new OpenAI({ apiKey });

  console.log(
    `[smoke] ${PROCESS_IMAGE_MODEL} @ ${PROCESS_IMAGE_QUALITY}, canvas ${prepared.letterbox.size}, → ${targetLanguage}`,
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
            text: `Edit this UI screenshot in place. Do not redesign or crop the frame. Translate all visible UI text into natural ${targetLanguage}. Keep the full screenshot visible: same layout, colors, backgrounds, icons, spacing, and typography. Only replace readable UI copy.`,
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: PROCESS_IMAGE_INPUT_DETAIL,
          },
        ],
      },
    ],
    tools: [buildImageGenerationTool(outputFormat, prepared.letterbox.size)],
    tool_choice: { type: "image_generation" },
  });

  const call = imageResponse.output?.find(
    (item) => item.type === "image_generation_call" && "result" in item && item.result,
  );
  if (!call || !("result" in call) || !call.result) {
    throw new Error("OpenAI did not return a localized image.");
  }

  const cropped = await cropTranslatedScreenshot(
    Buffer.from(call.result as string, "base64"),
    prepared.letterbox,
    outputFormat,
  );
  const meta = await sharp(cropped).metadata();

  const outputPath = path.join(process.cwd(), "tmp-imagegen.png");
  fs.writeFileSync(outputPath, cropped);

  console.log(`[smoke] Generated in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`[smoke] Output: ${meta.width}x${meta.height} → ${outputPath}`);
}

main().catch((error) => {
  console.error("\n❌ image-gen smoke failed");
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
