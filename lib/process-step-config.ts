import type { ImageOutputFormat } from "@/lib/image-format";

export const PROCESS_STEP_METADATA_MODEL =
  process.env.PROCESS_STEP_METADATA_MODEL ?? "gpt-5.5";

export const PROCESS_IMAGE_MODEL =
  process.env.PROCESS_IMAGE_MODEL ?? "gpt-image-2";

export const PROCESS_IMAGE_QUALITY =
  (process.env.PROCESS_IMAGE_QUALITY as
    | "low"
    | "medium"
    | "high"
    | "auto"
    | undefined) ??
  "high";

export const PROCESS_IMAGE_SIZE_OVERRIDE = process.env.PROCESS_IMAGE_SIZE;

export const PROCESS_IMAGE_OUTPUT_FORMAT_OVERRIDE = process.env
  .PROCESS_IMAGE_OUTPUT_FORMAT as ImageOutputFormat | undefined;

export const PROCESS_IMAGE_OUTPUT_COMPRESSION = Number(
  process.env.PROCESS_IMAGE_OUTPUT_COMPRESSION ?? "88",
);

export const PLACEHOLDER_STEP_TITLE = "Localized screen";
export const PLACEHOLDER_STEP_SUMMARY = "Localized UI screenshot";

export function resolveOutputFormat(
  sourceFormat: ImageOutputFormat,
): ImageOutputFormat {
  void sourceFormat;
  return PROCESS_IMAGE_OUTPUT_FORMAT_OVERRIDE ?? "png";
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
