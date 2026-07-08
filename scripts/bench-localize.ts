/**
 * Benchmark + coverage harness for the localize pipeline.
 * Run: npx tsx --env-file=.env.local scripts/bench-localize.ts [image-path] [runs]
 *
 * Reports per-phase timing, total time, and translation coverage
 * (how many inventoried strings were located AND translated).
 */
import fs from "fs";
import OpenAI from "openai";
import path from "path";
import sharp from "sharp";

import { localizeScreenshot } from "../lib/localize-screenshot";
import { bufferToDataUrl } from "../lib/prepare-screenshot";

const DEFAULT_IMAGE =
  "/Users/lw/.cursor/projects/Users-lw-screen-translation-workspace/assets/image-d8d1fca1-a4fb-4690-8d26-469f028e637a.png";

function normalizeKey(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

async function groundTruthInventory(
  openai: OpenAI,
  imageDataUrl: string,
): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: process.env.PROCESS_VISION_MODEL ?? "gpt-4o",
    response_format: { type: "json_object" },
    max_tokens: 2048,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `List EVERY visible text string in this UI screenshot exactly as shown. JSON only: { "strings": ["..."] }`,
          },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  return ((parsed.strings as string[] | undefined) ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

  const imagePath = process.argv[2] ?? DEFAULT_IMAGE;
  const runs = Number(process.argv[3] ?? "1");
  if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

  const sourceBuffer = fs.readFileSync(imagePath);
  const openai = new OpenAI({ apiKey });

  const rotated = await sharp(sourceBuffer).rotate().png().toBuffer();
  const imageDataUrl = bufferToDataUrl(rotated, "image/png");

  console.log(`[bench] Ground-truth inventory…`);
  const inventory = await groundTruthInventory(openai, imageDataUrl);
  const inventoryKeys = new Set(inventory.map(normalizeKey));
  console.log(`[bench] Inventory strings: ${inventory.length}`);

  const times: number[] = [];

  for (let run = 1; run <= runs; run++) {
    const started = Date.now();
    const result = await localizeScreenshot(openai, sourceBuffer, {
      targetLanguage: "zh",
      openAiFormat: "png",
    });
    const seconds = (Date.now() - started) / 1000;
    times.push(seconds);

    const located = result.debugBlocks ?? [];
    const locatedText = located.map((b) => normalizeKey(b.source_text));
    const covers = (invKey: string) =>
      locatedText.some((t) => t === invKey || t.includes(invKey));
    const foundCount = [...inventoryKeys].filter(covers).length;
    const translatedCount = located.filter(
      (b) => b.translated_text && b.translated_text !== b.source_text,
    ).length;
    const missing = inventory.filter((s) => !covers(normalizeKey(s)));

    const outputPath = path.join(process.cwd(), `tmp-bench-${run}.png`);
    fs.writeFileSync(outputPath, result.buffer);

    console.log(`\n=== Run ${run} ===`);
    console.log(`  Time:        ${seconds.toFixed(1)}s`);
    console.log(`  Located:     ${located.length} blocks`);
    console.log(
      `  Coverage:    ${foundCount}/${inventory.length} (${((foundCount / inventory.length) * 100).toFixed(0)}%)`,
    );
    console.log(`  Translated:  ${translatedCount}/${located.length}`);
    if (missing.length) console.log(`  Missing:     ${JSON.stringify(missing)}`);
    console.log(`  Title:       ${result.title}`);
    console.log(`  Output:      ${outputPath}`);
  }

  if (times.length > 1) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(
      `\n[bench] avg ${avg.toFixed(1)}s  min ${Math.min(...times).toFixed(1)}s  max ${Math.max(...times).toFixed(1)}s`,
    );
  }
}

main().catch((error) => {
  console.error("\n❌ Bench failed");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
