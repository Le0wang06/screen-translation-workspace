import type { UiTextBlock } from "@/lib/ui-text-types";

function blockIoU(left: UiTextBlock, right: UiTextBlock) {
  const x1 = Math.max(left.bbox.x, right.bbox.x);
  const y1 = Math.max(left.bbox.y, right.bbox.y);
  const x2 = Math.min(left.bbox.x + left.bbox.w, right.bbox.x + right.bbox.w);
  const y2 = Math.min(left.bbox.y + left.bbox.h, right.bbox.y + right.bbox.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection <= 0) return 0;
  const union =
    left.bbox.w * left.bbox.h + right.bbox.w * right.bbox.h - intersection;
  return intersection / union;
}

function mergeTitleStatusLines(blocks: UiTextBlock[]): UiTextBlock[] {
  const result: UiTextBlock[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < blocks.length; i++) {
    if (consumed.has(i)) continue;
    const block = blocks[i];
    const kind = block.style.kind ?? "body";

    if (kind !== "title") {
      result.push(block);
      continue;
    }

    const statusIndex = blocks.findIndex((other, index) => {
      if (index === i || consumed.has(index)) return false;
      if ((other.style.kind ?? "body") !== "status") return false;
      return Math.abs(other.bbox.y - block.bbox.y) < 0.03;
    });

    if (statusIndex === -1) {
      result.push(block);
      continue;
    }

    consumed.add(statusIndex);
    const status = blocks[statusIndex];
    const x = Math.min(block.bbox.x, status.bbox.x);
    const y = Math.min(block.bbox.y, status.bbox.y);
    const right = Math.max(block.bbox.x + block.bbox.w, status.bbox.x + status.bbox.w);
    const bottom = Math.max(block.bbox.y + block.bbox.h, status.bbox.y + status.bbox.h);

    result.push({
      ...block,
      source_text: `${block.source_text} • ${status.source_text}`,
      translated_text: `${block.translated_text} • ${status.translated_text}`,
      bbox: {
        x,
        y,
        w: Math.min(0.78, right - x),
        h: Math.min(0.05, bottom - y),
      },
    });
  }

  return result;
}

export function refineUiBlocks(blocks: UiTextBlock[]): UiTextBlock[] {
  const capped = blocks.map((block) => {
    const kind = block.style.kind ?? "body";
    const { x, y } = block.bbox;
    let { w, h } = block.bbox;

    // Trust located x/y; only clamp widths to sane maxima so a stray wide box
    // can't paint a giant mask across the row.
    if (kind === "status") {
      w = Math.min(w, 0.22);
    } else if (kind === "button" || kind === "link") {
      w = Math.min(Math.max(w, 0.1), 0.34);
    } else if (kind === "heading" || kind === "title") {
      w = Math.min(w, 0.72);
    } else if (kind === "body") {
      w = Math.min(w, 0.92);
    }
    h = Math.min(h, 0.06);

    return {
      ...block,
      bbox: {
        x: Math.min(x, 1 - w),
        y: Math.min(y, 1 - h),
        w,
        h,
      },
    };
  });

  const kept: UiTextBlock[] = [];

  for (const block of capped) {
    const key = block.source_text.toLowerCase().replace(/\s+/g, " ").trim();
    const duplicate = kept.findIndex((existing) => {
      const existingKey = existing.source_text.toLowerCase().replace(/\s+/g, " ").trim();
      if (existingKey === key) return true;
      return blockIoU(existing, block) > 0.55;
    });

    if (duplicate === -1) {
      kept.push(block);
      continue;
    }

    const existing = kept[duplicate];
    const existingKey = existing.source_text.toLowerCase().replace(/\s+/g, " ").trim();
    if (existingKey === key) {
      const existingArea = existing.bbox.w * existing.bbox.h;
      const nextArea = block.bbox.w * block.bbox.h;
      if (nextArea > 0 && nextArea < existingArea) {
        kept[duplicate] = block;
      }
      continue;
    }

    if (block.source_text.length < existing.source_text.length) {
      kept[duplicate] = block;
    }
  }

  return mergeTitleStatusLines(
    kept.sort((left, right) => {
      const y = left.bbox.y - right.bbox.y;
      if (Math.abs(y) > 0.005) return y;
      return left.bbox.x - right.bbox.x;
    }),
  );
}

export function bboxToPixelRect(
  block: UiTextBlock,
  imageWidth: number,
  imageHeight: number,
) {
  const left = Math.max(0, Math.min(imageWidth - 1, Math.round(block.bbox.x * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round(block.bbox.y * imageHeight)));
  const width = Math.max(
    1,
    Math.min(imageWidth - left, Math.round(block.bbox.w * imageWidth)),
  );
  const height = Math.max(
    1,
    Math.min(imageHeight - top, Math.round(block.bbox.h * imageHeight)),
  );
  return { left, top, width, height };
}
