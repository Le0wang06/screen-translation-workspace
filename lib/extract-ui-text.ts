import OpenAI from "openai";

import type { UiExtractionResult, UiTextBlock } from "@/lib/ui-text-types";

export const PROCESS_VISION_MODEL = process.env.PROCESS_VISION_MODEL ?? "gpt-4o";

const MAX_ANALYSIS_WIDTH = 2048;

function buildExtractionPrompt(
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
) {
  const sourceHint = sourceLanguage
    ? `Source UI language: ${sourceLanguage}.`
    : "Detect the source language from the screenshot.";

  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";

  return `You are locating UI text in a screenshot for an in-place translation overlay.
${sourceHint}${notesHint}

Return JSON only:
{
  "title": "short screen title in ${targetLanguage}",
  "summary": "one English sentence about what the user is doing",
  "source_language": "iso code",
  "blocks": [
    {
      "source_text": "exact visible text",
      "translated_text": "translation in ${targetLanguage}",
      "bbox_1000": [ymin, xmin, ymax, xmax],
      "style": {
        "color": "#ffffff",
        "background": "#0d1117",
        "font_weight": "normal",
        "align": "left",
        "kind": "body"
      }
    }
  ]
}

- bbox_1000 uses a 0-1000 grid on the screenshot (0,0 = top-left). Values must tightly wrap ONLY the pixels of source_text.
- Each block's bbox_1000 must sit exactly where source_text appears — translations will be painted into this same box
- xmin/xmax are horizontal edges of the text; ymin/ymax are vertical edges

Rules:
- Measure each text element at its REAL pixel position in the image — never invent a grid or column
- Typical single-line labels are narrow (xmax-xmin often 80-450 on a 1000-wide grid)
- Right-side buttons/links usually have xmin between 550-950; left titles usually xmin 20-300
- Include left-side titles, descriptions, status badges, right-side buttons, and blue links
- Split "Title · Status" into separate blocks when colors differ — status bbox wraps only the status word
- style.kind: heading, title, body, status, button, link
- Buttons: kind=button, align=center, bbox wraps the full button chrome
- Links: kind=link, blue color, bbox wraps only the link text
- Descriptions: kind=body, bbox on the gray subtitle line only`;
}

function bboxFrom1000(values: number[]) {
  const [ymin, xmin, ymax, xmax] = values;
  const x = Math.min(xmin, xmax) / 1000;
  const y = Math.min(ymin, ymax) / 1000;
  const w = Math.abs(xmax - xmin) / 1000;
  const h = Math.abs(ymax - ymin) / 1000;
  return { x, y, w, h };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeBlock(raw: Partial<UiTextBlock> & { bbox_1000?: number[] }): UiTextBlock | null {
  const source = raw.source_text?.trim();
  const translated = raw.translated_text?.trim();
  const bboxValues = raw.bbox_1000;
  const bbox = bboxValues?.length === 4 ? bboxFrom1000(bboxValues) : raw.bbox;

  if (!source || !translated || !bbox) {
    return null;
  }

  const x = clamp01(bbox.x ?? 0);
  const y = clamp01(bbox.y ?? 0);
  const w = clamp01(bbox.w ?? 0);
  const h = clamp01(bbox.h ?? 0);

  if (w <= 0 || h <= 0) {
    return null;
  }

  // Reject obvious hallucinated half-width columns.
  if (w >= 0.48 && h <= 0.08 && (raw.style?.kind ?? "body") !== "body") {
    return null;
  }

  const style = raw.style ?? {
    color: "#ffffff",
    background: "#0d1117",
  };

  return {
    source_text: source,
    translated_text: translated,
    bbox: {
      x,
      y,
      w: Math.min(w, 1 - x),
      h: Math.min(h, 1 - y),
    },
    style: {
      color: style.color || "#ffffff",
      background: style.background || "#0d1117",
      font_weight: style.font_weight || "normal",
      align: style.align || "left",
      kind: style.kind || "body",
    },
  };
}

export async function extractUiText(
  openai: OpenAI,
  imageDataUrl: string,
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
): Promise<UiExtractionResult> {
  const response = await openai.chat.completions.create({
    model: PROCESS_VISION_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildExtractionPrompt(sourceLanguage, targetLanguage, notes),
          },
          {
            type: "image_url",
            image_url: { url: imageDataUrl, detail: "high" },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Vision model returned empty text extraction.");
  }

  const parsed = JSON.parse(content) as {
    title?: string;
    summary?: string;
    source_language?: string;
    blocks?: Array<Partial<UiTextBlock> & { bbox_1000?: number[] }>;
  };

  const blocks = (parsed.blocks ?? [])
    .map(normalizeBlock)
    .filter((block): block is UiTextBlock => block !== null);

  if (blocks.length === 0) {
    throw new Error("No translatable text blocks were detected in the screenshot.");
  }

  return {
    title: parsed.title?.trim() || "Localized screen",
    summary: parsed.summary?.trim() || "Localized UI screenshot",
    source_language: parsed.source_language?.trim(),
    blocks,
  };
}

export { MAX_ANALYSIS_WIDTH };
