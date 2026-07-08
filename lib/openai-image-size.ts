export type OpenAiImageSize = "1024x1024" | "1536x1024" | "1024x1536";

export const OPENAI_CANVAS_SIZES: Record<
  OpenAiImageSize,
  { width: number; height: number }
> = {
  "1024x1024": { width: 1024, height: 1024 },
  "1536x1024": { width: 1536, height: 1024 },
  "1024x1536": { width: 1024, height: 1536 },
};

export type LetterboxCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LetterboxPlan = {
  size: OpenAiImageSize;
  canvasWidth: number;
  canvasHeight: number;
  crop: LetterboxCrop;
};

export function pickOpenAiImageSize(width: number, height: number): OpenAiImageSize {
  if (width <= 0 || height <= 0) {
    return "1024x1024";
  }

  const ratio = width / height;
  if (ratio > 1.2) {
    return "1536x1024";
  }
  if (ratio < 0.83) {
    return "1024x1536";
  }
  return "1024x1024";
}

export function computeLetterboxPlan(
  sourceWidth: number,
  sourceHeight: number,
): LetterboxPlan {
  const size = pickOpenAiImageSize(sourceWidth, sourceHeight);
  const { width: canvasWidth, height: canvasHeight } = OPENAI_CANVAS_SIZES[size];

  const scale = Math.min(
    canvasWidth / sourceWidth,
    canvasHeight / sourceHeight,
  );
  const scaledWidth = Math.max(1, Math.round(sourceWidth * scale));
  const scaledHeight = Math.max(1, Math.round(sourceHeight * scale));
  const left = Math.round((canvasWidth - scaledWidth) / 2);
  const top = Math.round((canvasHeight - scaledHeight) / 2);

  return {
    size,
    canvasWidth,
    canvasHeight,
    crop: {
      left,
      top,
      width: scaledWidth,
      height: scaledHeight,
    },
  };
}
