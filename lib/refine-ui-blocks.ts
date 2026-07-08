import type { UiTextBlock } from "@/lib/ui-text-types";

function blockArea(block: UiTextBlock) {
  return block.bbox.w * block.bbox.h;
}

function blockCenterY(block: UiTextBlock) {
  return block.bbox.y + block.bbox.h / 2;
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
  if (block.style.kind === "button") {
    return "center";
  }
  if (block.style.kind === "link" && block.bbox.x > 0.5) {
    return "left";
  }
  if (block.bbox.x > 0.58) {
    return "right";
  }
  return "left";
}

function clusterRows(blocks: UiTextBlock[]) {
  const sorted = [...blocks].sort((left, right) => blockCenterY(left) - blockCenterY(right));
  const rows: UiTextBlock[][] = [];

  for (const block of sorted) {
    const centerY = blockCenterY(block);
    const row = rows.find((group) => {
      const rowCenter = blockCenterY(group[0]);
      return Math.abs(rowCenter - centerY) <= 0.018;
    });

    if (row) {
      row.push(block);
    } else {
      rows.push([block]);
    }
  }

  return rows;
}

function snapStatusToTitleRow(blocks: UiTextBlock[]) {
  const rows = clusterRows(blocks);

  return rows.flatMap((row) => {
    const anchor = row.find(
      (block) => block.style.kind === "title" || block.style.kind === "heading",
    );

    if (!anchor) {
      return row;
    }

    const anchorY = anchor.bbox.y;
    const anchorH = anchor.bbox.h;

    return row.map((block) => {
      if (block.style.kind !== "status") {
        return block;
      }

      return {
        ...block,
        bbox: {
          ...block.bbox,
          y: anchorY + (anchorH - block.bbox.h) / 2,
        },
      };
    });
  });
}

function dedupeOverlappingBlocks(blocks: UiTextBlock[]) {
  const kept: UiTextBlock[] = [];

  for (const block of blocks) {
    const overlapIndex = kept.findIndex(
      (existing) => blockIoU(existing, block) > 0.45,
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
  const snapped = snapStatusToTitleRow(deduped);

  return snapped
    .map((block) => ({
      ...block,
      style: {
        ...block.style,
        align: inferAlign(block),
      },
    }))
    .sort((left, right) => {
      const yDiff = left.bbox.y - right.bbox.y;
      if (Math.abs(yDiff) > 0.006) {
        return yDiff;
      }
      return left.bbox.x - right.bbox.x;
    });
}

export function bboxToPixelRect(
  block: UiTextBlock,
  imageWidth: number,
  imageHeight: number,
  options?: { padX?: number; padY?: number; expandRight?: number },
) {
  const padX = options?.padX ?? 2;
  const padY = options?.padY ?? 2;
  const expandRight = options?.expandRight ?? 0;

  const left = Math.max(0, Math.round(block.bbox.x * imageWidth) - padX);
  const top = Math.max(0, Math.round(block.bbox.y * imageHeight) - padY);
  const baseWidth = Math.round(block.bbox.w * imageWidth) + padX * 2 + expandRight;
  const width = Math.min(imageWidth - left, Math.max(1, baseWidth));
  const height = Math.min(
    imageHeight - top,
    Math.max(1, Math.round(block.bbox.h * imageHeight) + padY * 2),
  );

  return { left, top, width, height };
}
