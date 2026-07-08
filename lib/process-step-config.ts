import type { ImageOutputFormat } from "@/lib/image-format";
import type { OpenAiImageSize } from "@/lib/openai-image-size";

export const PROCESS_STEP_RESPONSE_MODEL =
  process.env.PROCESS_STEP_RESPONSE_MODEL ?? "gpt-4o-mini";

export const PROCESS_IMAGE_MODEL =
  process.env.PROCESS_IMAGE_MODEL ?? "gpt-image-1";

export const PROCESS_IMAGE_QUALITY =
  (process.env.PROCESS_IMAGE_QUALITY as "low" | "medium" | "high" | undefined) ??
  "high";

export const PROCESS_IMAGE_INPUT_DETAIL =
  (process.env.PROCESS_IMAGE_INPUT_DETAIL as "low" | "high" | "auto" | undefined) ??
  "auto";

// Low fidelity lets the model re-render translated text crisply. High fidelity
// tries to preserve original pixels and garbles the rewritten text.
export const PROCESS_IMAGE_INPUT_FIDELITY =
  (process.env.PROCESS_IMAGE_INPUT_FIDELITY as "low" | "high" | undefined) ??
  "low";

export const PROCESS_IMAGE_OUTPUT_FORMAT_OVERRIDE = process.env
  .PROCESS_IMAGE_OUTPUT_FORMAT as ImageOutputFormat | undefined;

export const PROCESS_IMAGE_OUTPUT_COMPRESSION = Number(
  process.env.PROCESS_IMAGE_OUTPUT_COMPRESSION ?? "88",
);

export function buildImageGenerationTool(
  outputFormat: ImageOutputFormat,
  size: OpenAiImageSize,
) {
  const format = PROCESS_IMAGE_OUTPUT_FORMAT_OVERRIDE ?? outputFormat;

  return {
    type: "image_generation" as const,
    action: "edit" as const,
    model: PROCESS_IMAGE_MODEL,
    quality: PROCESS_IMAGE_QUALITY,
    output_format: format,
    size,
    ...(format === "jpeg" || format === "webp"
      ? { output_compression: PROCESS_IMAGE_OUTPUT_COMPRESSION }
      : {}),
    moderation: "low" as const,
    input_fidelity: PROCESS_IMAGE_INPUT_FIDELITY,
  };
}

export const PLACEHOLDER_STEP_TITLE = "Localized screen";
export const PLACEHOLDER_STEP_SUMMARY = "Localized UI screenshot";

export function resolveOutputFormat(sourceFormat: ImageOutputFormat): ImageOutputFormat {
  return PROCESS_IMAGE_OUTPUT_FORMAT_OVERRIDE ?? sourceFormat;
}

export function storageExtensionForFormat(format: ImageOutputFormat) {
  if (format === "jpeg") return "jpg";
  if (format === "webp") return "webp";
  return "png";
}

export function contentTypeForFormat(format: ImageOutputFormat) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}
