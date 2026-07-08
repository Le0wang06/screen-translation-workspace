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

export function refineUiBlocks(blocks: UiTextBlock[]): UiTextBlock[] {
  const kept: UiTextBlock[] = [];

  for (const block of blocks) {
    const overlap = kept.findIndex((existing) => blockIoU(existing, block) > 0.5);
    if (overlap === -1) {
      kept.push(block);
      continue;
    }
    const existing = kept[overlap];
    if (block.source_text.length < existing.source_text.length) {
      kept[overlap] = block;
    }
  }

  return kept.sort((left, right) => {
    const y = left.bbox.y - right.bbox.y;
    if (Math.abs(y) > 0.005) return y;
    return left.bbox.x - right.bbox.x;
  });
}

export function bboxToPixelRect(
  block: UiTextBlock,
  imageWidth: number,
  imageHeight: number,
) {
  const left = Math.max(0, Math.round(block.bbox.x * imageWidth));
  const top = Math.max(0, Math.round(block.bbox.y * imageHeight));
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
