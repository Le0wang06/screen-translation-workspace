import type { UiTextBlock } from "@/lib/ui-text-types";

function blockArea(block: UiTextBlock) {
  return block.bbox.w * block.bbox.h;
}

function blockIoU(left: UiTextBlock, right: UiTextBlock) {
  const x1 = Math.max(left.bbox.x, right.bbox.x);
  const y1 = Math.max(left.bbox.y, right.bbox.y);
  const x2 = Math.min(left.bbox.x + left.bbox.w, right.bbox.x + right.bbox.w);
  const y2 = Math.min(left.bbox.y + left.bbox.h, right.bbox.y + right.bbox.h);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection <= 0) {
    return 0;
  }

  const union = blockArea(left) + blockArea(right) - intersection;
  return union > 0 ? intersection / union : 0;
}

function inferAlign(block: UiTextBlock): UiTextBlock["style"]["align"] {
  if (block.style.align && block.style.align !== "left") {
    return block.style.align;
  }
  if (block.style.kind === "button") {
    return "center";
  }
  if (block.style.kind === "link" && block.bbox.x > 0.5) {
    return "right";
  }
  if (block.bbox.x > 0.62) {
    return "right";
  }
  return "left";
}

function dedupeOverlappingBlocks(blocks: UiTextBlock[]) {
  const kept: UiTextBlock[] = [];

  for (const block of blocks) {
    const overlapIndex = kept.findIndex(
      (existing) => blockIoU(existing, block) > 0.55,
    );

    if (overlapIndex === -1) {
      kept.push(block);
      continue;
    }

    const existing = kept[overlapIndex];
    const replace =
      blockArea(block) < blockArea(existing) ||
      block.source_text.length < existing.source_text.length;

    if (replace) {
      kept[overlapIndex] = block;
    }
  }

  return kept;
}

export function refineUiBlocks(blocks: UiTextBlock[]): UiTextBlock[] {
  const deduped = dedupeOverlappingBlocks(blocks);

  return deduped
    .map((block) => ({
      ...block,
      style: {
        ...block.style,
        align: inferAlign(block),
      },
    }))
    .sort((left, right) => {
      const yDiff = left.bbox.y - right.bbox.y;
      if (Math.abs(yDiff) > 0.008) {
        return yDiff;
      }
      return left.bbox.x - right.bbox.x;
    });
}

export function bboxToPixelRect(
  block: UiTextBlock,
  imageWidth: number,
  imageHeight: number,
  options?: { padX?: number; padY?: number },
) {
  const padX = options?.padX ?? 1;
  const padY = options?.padY ?? 1;

  const left = Math.max(0, Math.round(block.bbox.x * imageWidth) - padX);
  const top = Math.max(0, Math.round(block.bbox.y * imageHeight) - padY);
  const width = Math.min(
    imageWidth - left,
    Math.round(block.bbox.w * imageWidth) + padX * 2,
  );
  const height = Math.min(
    imageHeight - top,
    Math.round(block.bbox.h * imageHeight) + padY * 2,
  );

  return { left, top, width: Math.max(1, width), height: Math.max(1, height) };
}
