import OpenAI from "openai";

import type { UiTextBlock } from "@/lib/ui-text-types";

export const PROCESS_VISION_MODEL = process.env.PROCESS_VISION_MODEL ?? "gpt-4o";

function buildLocatePrompt(
  imageWidth: number,
  imageHeight: number,
  strict = false,
) {
  const strictHint = strict
    ? "\nCRITICAL: Place every bbox_px exactly on the visible source_text. Do not guess or stack text in the top-left."
    : "";

  return `Find every visible UI text string in this ${imageWidth}x${imageHeight}px screenshot.
${strictHint}

Return JSON only:
{
  "blocks": [
    {
      "source_text": "exact visible text",
      "bbox_px": [ymin, xmin, ymax, xmax],
      "kind": "heading"
    }
  ]
}

bbox_px: pixel coords on this image. Box must tightly wrap ONLY the text glyphs of source_text.
kind: heading | title | body | status | button | link

Rules:
- One block per distinct text element (split title and status if separate colors)
- Buttons/links on the right side of the screen get their own boxes on the button/link text only
- Do not merge multiple rows into one box
- Do not translate — source_text only`;
}

function bboxFromPixels(
  values: number[],
  imageWidth: number,
  imageHeight: number,
) {
  const [ymin, xmin, ymax, xmax] = values;
  return {
    x: Math.min(xmin, xmax) / imageWidth,
    y: Math.min(ymin, ymax) / imageHeight,
    w: Math.abs(xmax - xmin) / imageWidth,
    h: Math.abs(ymax - ymin) / imageHeight,
  };
}

function isClustered(blocks: UiTextBlock[]) {
  if (blocks.length < 4) return false;
  const clustered = blocks.filter((b) => b.bbox.x < 0.08 && b.bbox.y < 0.2).length;
  return clustered >= Math.ceil(blocks.length * 0.4);
}

function parseLocatedBlocks(
  raw: Array<{
    source_text?: string;
    bbox_px?: number[];
    kind?: UiTextBlock["style"]["kind"];
  }>,
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
      translated_text: source,
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

async function locateOnce(
  openai: OpenAI,
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
  strict: boolean,
) {
  const response = await openai.chat.completions.create({
    model: PROCESS_VISION_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildLocatePrompt(imageWidth, imageHeight, strict) },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Vision model returned empty localization.");

  const parsed = JSON.parse(content) as {
    blocks?: Array<{
      source_text?: string;
      bbox_px?: number[];
      kind?: UiTextBlock["style"]["kind"];
    }>;
  };

  return parseLocatedBlocks(parsed.blocks ?? [], imageWidth, imageHeight);
}

export async function locateUiText(
  openai: OpenAI,
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
): Promise<UiTextBlock[]> {
  let blocks = await locateOnce(openai, imageDataUrl, imageWidth, imageHeight, false);

  if (blocks.length === 0 || isClustered(blocks)) {
    blocks = await locateOnce(openai, imageDataUrl, imageWidth, imageHeight, true);
  }

  if (blocks.length === 0) {
    throw new Error("No text regions were detected in the screenshot.");
  }

  return blocks;
}
