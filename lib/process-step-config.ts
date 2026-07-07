export const PROCESS_STEP_RESPONSE_MODEL =
  process.env.PROCESS_STEP_RESPONSE_MODEL ?? "gpt-4o-mini";

export const PROCESS_IMAGE_MODEL =
  process.env.PROCESS_IMAGE_MODEL ?? "gpt-image-1-mini";

export const PROCESS_IMAGE_QUALITY =
  (process.env.PROCESS_IMAGE_QUALITY as "low" | "medium" | "high" | undefined) ??
  "low";

export const PROCESS_IMAGE_INPUT_DETAIL =
  (process.env.PROCESS_IMAGE_INPUT_DETAIL as "low" | "high" | "auto" | undefined) ??
  "low";

export const PROCESS_IMAGE_OUTPUT_FORMAT =
  (process.env.PROCESS_IMAGE_OUTPUT_FORMAT as "jpeg" | "png" | "webp" | undefined) ??
  "jpeg";

export const PROCESS_IMAGE_OUTPUT_COMPRESSION = Number(
  process.env.PROCESS_IMAGE_OUTPUT_COMPRESSION ?? "75",
);

export const PROCESS_IMAGE_TOOL = {
  type: "image_generation" as const,
  action: "edit" as const,
  model: PROCESS_IMAGE_MODEL,
  quality: PROCESS_IMAGE_QUALITY,
  output_format: PROCESS_IMAGE_OUTPUT_FORMAT,
  output_compression: PROCESS_IMAGE_OUTPUT_COMPRESSION,
  moderation: "low" as const,
  input_fidelity: "low" as const,
};

export const PLACEHOLDER_STEP_TITLE = "Localized screen";
export const PLACEHOLDER_STEP_SUMMARY = "Localized UI screenshot";
