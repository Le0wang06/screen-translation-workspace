import OpenAI from "openai";

import { translateStrings } from "@/lib/translate-ui-blocks";
import type { UiTextBlock } from "@/lib/ui-text-types";

export const PROCESS_VISION_MODEL = process.env.PROCESS_VISION_MODEL ?? "gpt-4o";

function buildInventoryPrompt(imageWidth: number, imageHeight: number) {
  return `List EVERY visible text string in this ${imageWidth}x${imageHeight}px UI screenshot.

Return JSON only:
{ "strings": ["Overview", "Security policy", "Disabled", "..."] }

Rules:
- Include page title, every row title, status badge, description line, button label, and link text
- Include right-side buttons like "Set up a security policy", "View security advisories", "Enable Dependabot alerts"
- Status badges (Enabled, Disabled, Needs setup) are separate strings — list each even if repeated
- Exact wording as shown — do not translate
- Do not skip small or gray text
- Typical settings pages have 22-35 strings`;
}

function buildRowLocatePrompt(imageWidth: number, imageHeight: number) {
  return `Find EVERY visible text element in this ${imageWidth}px wide by ${imageHeight}px tall UI screenshot. Do NOT translate — copy text exactly as shown.

Return JSON only, as a SINGLE flat list ordered top-to-bottom:
{
  "blocks": [
    {
      "source_text": "exact visible text",
      "bbox_px": [ymin, xmin, ymax, xmax],
      "kind": "heading|title|status|body|button|link"
    }
  ]
}

CRITICAL coordinate rules:
- bbox_px are ABSOLUTE pixel positions in the FULL image, NOT relative to any row or section.
- The origin [0,0] is the top-left of the whole image. ymax must be <= ${imageHeight} and xmax <= ${imageWidth}.
- ymin MUST increase as you go down the page. Text near the top has small ymin (~0); text near the bottom has ymin close to ${imageHeight}.
- Every element gets its own distinct ymin based on its true vertical position — do NOT reuse the same y for multiple rows.
- bbox_px tightly wraps ONLY that text's glyphs.

Content rules:
- First element is usually the page title (e.g. Overview) at the top.
- Each settings row has: a left title, a status badge (Enabled/Disabled/Needs setup), a gray description line, and a right-side button or link.
- Do NOT skip any text — every title, status, description, button, and link must appear.
- kind: heading=page title, title=row title, status=badge, body=description, button=bordered button on the right, link=blue link on the right.`;
}

function buildBboxPrompt(
  imageWidth: number,
  imageHeight: number,
  strings: string[],
  targetLanguage: string,
) {
  return `For each string below, return its tight pixel bounding box on this ${imageWidth}x${imageHeight}px screenshot and a natural ${targetLanguage} translation.

Strings to locate:
${JSON.stringify(strings)}

Return JSON only:
{
  "blocks": [
    {
      "source_text": "exact string from list",
      "translated_text": "natural ${targetLanguage} translation",
      "bbox_px": [ymin, xmin, ymax, xmax],
      "kind": "heading|title|body|status|button|link"
    }
  ]
}

bbox_px must tightly wrap ONLY that string's glyphs at its real position.
- ymin/xmin/ymax/xmax are pixel coords: 0 <= xmin,xmax <= ${imageWidth}, 0 <= ymin,ymax <= ${imageHeight}
- heading/title: row titles on the left
- status: Enabled/Disabled/Needs setup badges
- body: gray description lines
- button: bordered buttons on the right
- link: blue text links on the right

You MUST return a block with a translation for every string in the list.`;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function bboxFromPixels(
  values: number[],
  imageWidth: number,
  imageHeight: number,
) {
  const [ymin, xmin, ymax, xmax] = values;
  const x = clamp01(Math.min(xmin, xmax) / imageWidth);
  const y = clamp01(Math.min(ymin, ymax) / imageHeight);
  const right = clamp01(Math.max(xmin, xmax) / imageWidth);
  const bottom = clamp01(Math.max(ymin, ymax) / imageHeight);
  return {
    x,
    y,
    w: Math.max(0.002, right - x),
    h: Math.max(0.002, bottom - y),
  };
}

function normalizeBlockExtents(blocks: UiTextBlock[]) {
  let maxBottom = 0;
  for (const block of blocks) {
    maxBottom = Math.max(maxBottom, block.bbox.y + block.bbox.h);
  }
  if (maxBottom <= 1.02) return blocks;

  const scale = 1 / maxBottom;
  return blocks.map((block) => ({
    ...block,
    bbox: {
      ...block.bbox,
      y: block.bbox.y * scale,
      h: block.bbox.h * scale,
    },
  }));
}

type RawBlock = {
  source_text?: string;
  translated_text?: string;
  bbox_px?: number[];
  kind?: UiTextBlock["style"]["kind"];
};

function parseBlocks(
  raw: RawBlock[],
  imageWidth: number,
  imageHeight: number,
): UiTextBlock[] {
  const blocks: UiTextBlock[] = [];

  for (const item of raw) {
    const source = item.source_text?.trim();
    if (!source || item.bbox_px?.length !== 4) continue;

    const bbox = bboxFromPixels(item.bbox_px, imageWidth, imageHeight);
    if (bbox.w <= 0.002 || bbox.h <= 0.002) continue;

    const kind = item.kind ?? "body";
    blocks.push({
      source_text: source,
      translated_text: item.translated_text?.trim() || source,
      bbox: {
        x: bbox.x,
        y: bbox.y,
        w: Math.min(bbox.w, 1 - bbox.x),
        h: Math.min(bbox.h, 1 - bbox.y),
      },
      style: {
        color: kind === "link" ? "#58a6ff" : "#ffffff",
        background: "#0d1117",
        font_weight:
          kind === "title" || kind === "heading" ? "semibold" : "normal",
        align: kind === "button" ? "center" : "left",
        kind,
      },
    });
  }

  return blocks;
}

function normalizeKey(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function mergeBlocks(existing: UiTextBlock[], incoming: UiTextBlock[]) {
  const merged = [...existing];

  for (const block of incoming) {
    const key = normalizeKey(block.source_text);
    const duplicate = merged.findIndex(
      (item) => normalizeKey(item.source_text) === key,
    );
    if (duplicate === -1) {
      merged.push(block);
      continue;
    }
    const current = merged[duplicate];
    const currentArea = current.bbox.w * current.bbox.h;
    const nextArea = block.bbox.w * block.bbox.h;
    if (nextArea > 0 && nextArea <= currentArea * 1.5) {
      merged[duplicate] = block;
    }
  }

  return merged;
}

async function visionJson(
  openai: OpenAI,
  imageDataUrl: string,
  prompt: string,
) {
  const response = await openai.chat.completions.create({
    model: PROCESS_VISION_MODEL,
    response_format: { type: "json_object" },
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Vision model returned empty response.");
  }

  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * visionJson with one retry on an empty/malformed response. The vision model
 * occasionally returns empty content; a single retry clears most transient
 * failures without aborting the whole localization.
 */
async function visionJsonWithRetry(
  openai: OpenAI,
  imageDataUrl: string,
  prompt: string,
): Promise<Record<string, unknown>> {
  try {
    return await visionJson(openai, imageDataUrl, prompt);
  } catch {
    return visionJson(openai, imageDataUrl, prompt);
  }
}

async function locateBboxesForStrings(
  openai: OpenAI,
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
  strings: string[],
  targetLanguage: string,
): Promise<UiTextBlock[]> {
  if (strings.length === 0) return [];

  // Best-effort enrichment: never abort localization if this pass fails.
  let bboxJson: Record<string, unknown>;
  try {
    bboxJson = await visionJsonWithRetry(
      openai,
      imageDataUrl,
      buildBboxPrompt(imageWidth, imageHeight, strings, targetLanguage),
    );
  } catch {
    return [];
  }

  return parseBlocks(
    (bboxJson.blocks as RawBlock[]) ?? [],
    imageWidth,
    imageHeight,
  );
}

export type LocalizedUiText = {
  blocks: UiTextBlock[];
  title: string;
  summary: string;
  source_language?: string;
};

/**
 * Fast localize. Runs two branches in parallel:
 *   A) row-by-row locate (bbox + kind, NO translation) — fast, no CJK tokens
 *   B) inventory → translate those strings (+ title/summary)
 * then merges translations onto located blocks by source text. Because the
 * heavy CJK generation (B) overlaps the bbox work (A), wall time ≈ the slower
 * branch instead of their sum.
 */
export async function localizeUiText(
  openai: OpenAI,
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
  targetLanguage: string,
  sourceLanguage?: string | null,
  notes?: string | null,
): Promise<LocalizedUiText> {
  const debug = process.env.LOCALIZE_DEBUG === "1";
  const timed = async <T>(label: string, p: Promise<T>): Promise<T> => {
    if (!debug) return p;
    const t = Date.now();
    const result = await p;
    console.log(`[localize]   ${label}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
    return result;
  };

  const locatePromise = timed(
    "vision-locate",
    visionJsonWithRetry(
      openai,
      imageDataUrl,
      buildRowLocatePrompt(imageWidth, imageHeight),
    ),
  );

  const translatePromise = (async () => {
    const inventoryJson = await timed(
      "vision-inventory",
      visionJsonWithRetry(
        openai,
        imageDataUrl,
        buildInventoryPrompt(imageWidth, imageHeight),
      ),
    );
    const strings = ((inventoryJson.strings as string[] | undefined) ?? [])
      .map((value) => value.trim())
      .filter(Boolean);
    const meta = await timed(
      "translate",
      translateStrings(openai, strings, targetLanguage, sourceLanguage, notes),
    );
    return { strings, meta };
  })();

  const [locateJson, { strings, meta }] = await Promise.all([
    locatePromise,
    translatePromise,
  ]);

  let blocks = parseBlocks(
    (locateJson.blocks as RawBlock[]) ?? [],
    imageWidth,
    imageHeight,
  );

  if (strings.length === 0 && blocks.length === 0) {
    throw new Error("No text strings were detected in the screenshot.");
  }

  blocks = blocks.map((block) => {
    const translated = meta.byKey.get(normalizeKey(block.source_text));
    return translated ? { ...block, translated_text: translated } : block;
  });

  const foundKeys = new Set(blocks.map((block) => normalizeKey(block.source_text)));
  const missing = strings.filter((value) => !foundKeys.has(normalizeKey(value)));

  if (missing.length > 0) {
    const extra = (
      await locateBboxesForStrings(
        openai,
        imageDataUrl,
        imageWidth,
        imageHeight,
        missing,
        targetLanguage,
      )
    ).map((block) => {
      const translated = meta.byKey.get(normalizeKey(block.source_text));
      return translated ? { ...block, translated_text: translated } : block;
    });
    blocks = mergeBlocks(blocks, extra);
  }

  if (blocks.length === 0) {
    throw new Error("No text regions were detected in the screenshot.");
  }

  blocks = normalizeBlockExtents(blocks);

  return {
    blocks,
    title: meta.title,
    summary: meta.summary,
    source_language: meta.source_language || sourceLanguage || undefined,
  };
}

/** Locate-only pass, used by the debug script. */
export async function locateUiText(
  openai: OpenAI,
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
): Promise<UiTextBlock[]> {
  const { blocks } = await localizeUiText(
    openai,
    imageDataUrl,
    imageWidth,
    imageHeight,
    "zh",
  );
  return blocks;
}
