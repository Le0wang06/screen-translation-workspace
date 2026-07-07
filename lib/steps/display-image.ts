type StepImageFields = {
  image_url: string;
  translated_image_url?: string | null;
  status: string;
};

export function stepPreviewImagePath(step: StepImageFields) {
  if (step.status === "done" && step.translated_image_url) {
    return step.translated_image_url;
  }

  return step.image_url;
}
