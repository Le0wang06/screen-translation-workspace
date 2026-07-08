import OpenAI from "openai";

import type { UiExtractionResult, UiTextBlock } from "@/lib/ui-text-types";

export const PROCESS_VISION_MODEL = process.env.PROCESS_VISION_MODEL ?? "gpt-4o";

function buildExtractionPrompt(
  imageWidth: number,
  imageHeight: number,
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
  strict = false,
) {
  const sourceHint = sourceLanguage
    ? `Source UI language: ${sourceLanguage}.`
    : "Detect the source language from the screenshot.";

  const notesHint = notes?.trim() ? `\nReviewer notes: ${notes.trim()}` : "";
  const strictHint = strict
    ? "\nCRITICAL: Previous attempt had wrong positions. Each bbox_px must match the exact pixel location of source_text in THIS image. Do not stack blocks in the top-left corner."
    : "";

  return `Locate UI text in this ${imageWidth}x${imageHeight}px screenshot for in-place translation overlays.
${sourceHint}${notesHint}${strictHint}

Return JSON only:
{
  "title": "short screen title in ${targetLanguage}",
  "summary": "one English sentence about what the user is doing",
  "source_language": "iso code",
  "blocks": [
    {
      "source_text": "exact visible text",
      "translated_text": "translation in ${targetLanguage}",
      "bbox_px": [ymin, xmin, ymax, xmax],
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

bbox_px uses pixel coordinates on this ${imageWidth}x${imageHeight} image (0,0 = top-left). ymin/ymax are vertical edges; xmin/xmax are horizontal edges. The box must tightly wrap ONLY source_text pixels.

Rules:
- Every block must stay at the same screen position as source_text — never relocate text to a new column or row
- Left titles: xmin typically 30-350; descriptions below titles on the left; status words sit beside titles on the same row
- Right buttons/links: xmin typically 55%-95% of image width
- Split "Title · Status" into separate blocks with separate tight boxes
- style.kind: heading, title, body, status, button, link
- Buttons: kind=button, align=center; links: kind=link, color #58a6ff`;
}

function bboxFromPixels(
  values: number[],
  imageWidth: number,
  imageHeight: number,
) {
  const [ymin, xmin, ymax, xmax] = values;
  const x = Math.min(xmin, xmax) / imageWidth;
  const y = Math.min(ymin, ymax) / imageHeight;
  const w = Math.abs(xmax - xmin) / imageWidth;
  const h = Math.abs(ymax - ymin) / imageHeight;
  return { x, y, w, h };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeBlock(
  raw: Partial<UiTextBlock> & { bbox_px?: number[] },
  imageWidth: number,
  imageHeight: number,
): UiTextBlock | null {
  const source = raw.source_text?.trim();
  const translated = raw.translated_text?.trim();
  const bboxValues = raw.bbox_px;
  const bbox =
    bboxValues?.length === 4
      ? bboxFromPixels(bboxValues, imageWidth, imageHeight)
      : raw.bbox;

  if (!source || !translated || !bbox) {
    return null;
  }

  const x = clamp01(bbox.x ?? 0);
  const y = clamp01(bbox.y ?? 0);
  const w = clamp01(bbox.w ?? 0);
  const h = clamp01(bbox.h ?? 0);

  if (w <= 0.002 || h <= 0.002) {
    return null;
  }

  if (w >= 0.7 && (raw.style?.kind ?? "body") !== "body") {
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

function isClusteredLayout(blocks: UiTextBlock[]) {
  if (blocks.length < 4) {
    return false;
  }

  const topLeft = blocks.filter(
    (block) => block.bbox.x < 0.08 && block.bbox.y < 0.2,
  ).length;

  return topLeft >= Math.ceil(blocks.length * 0.45);
}

async function requestExtraction(
  openai: OpenAI,
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
  strict = false,
) {
  const response = await openai.chat.completions.create({
    model: PROCESS_VISION_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildExtractionPrompt(
              imageWidth,
              imageHeight,
              sourceLanguage,
              targetLanguage,
              notes,
              strict,
            ),
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
    blocks?: Array<Partial<UiTextBlock> & { bbox_px?: number[] }>;
  };

  const blocks = (parsed.blocks ?? [])
    .map((block) => normalizeBlock(block, imageWidth, imageHeight))
    .filter((block): block is UiTextBlock => block !== null);

  return {
    title: parsed.title?.trim() || "Localized screen",
    summary: parsed.summary?.trim() || "Localized UI screenshot",
    source_language: parsed.source_language?.trim(),
    blocks,
  };
}

export async function extractUiText(
  openai: OpenAI,
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  notes?: string | null,
): Promise<UiExtractionResult> {
  let result = await requestExtraction(
    openai,
    imageDataUrl,
    imageWidth,
    imageHeight,
    sourceLanguage,
    targetLanguage,
    notes,
  );

  if (result.blocks.length === 0 || isClusteredLayout(result.blocks)) {
    result = await requestExtraction(
      openai,
      imageDataUrl,
      imageWidth,
      imageHeight,
      sourceLanguage,
      targetLanguage,
      notes,
      true,
    );
  }

  if (result.blocks.length === 0) {
    throw new Error("No translatable text blocks were detected in the screenshot.");
  }

  return result;
}
