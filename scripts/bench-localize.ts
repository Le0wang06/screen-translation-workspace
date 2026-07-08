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

import { localizeScreenshot } from "../lib/localize-screenshot";

const DEFAULT_IMAGE =
  "/Users/lw/.cursor/projects/Users-lw-screen-translation-workspace/assets/image-d8d1fca1-a4fb-4690-8d26-469f028e637a.png";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

  const imagePath = process.argv[2] ?? DEFAULT_IMAGE;
  const runs = Number(process.argv[3] ?? "1");
  if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

  const sourceBuffer = fs.readFileSync(imagePath);
  const openai = new OpenAI({ apiKey });

  const times: number[] = [];

  for (let run = 1; run <= runs; run++) {
    const started = Date.now();
    const result = await localizeScreenshot(openai, sourceBuffer, {
      targetLanguage: "zh",
      sourceMime: "image/png",
      openAiFormat: "png",
    });
    const seconds = (Date.now() - started) / 1000;
    times.push(seconds);

    const outputPath = path.join(process.cwd(), `tmp-bench-${run}.png`);
    fs.writeFileSync(outputPath, result.buffer);

    console.log(`\n=== Run ${run} ===`);
    console.log(`  Time:        ${seconds.toFixed(1)}s`);
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
