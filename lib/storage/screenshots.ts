export const SCREENSHOTS_BUCKET = "screenshots";

export function screenshotStoragePath(
  projectId: string,
  flowId: string,
  stepId: string,
  extension: string,
) {
  const safeExtension = extension.replace(/^\./, "").toLowerCase() || "png";
  return `${projectId}/${flowId}/${stepId}.${safeExtension}`;
}

export function localizedScreenshotStoragePath(
  projectId: string,
  flowId: string,
  stepId: string,
  extension = "png",
) {
  const safeExtension = extension.replace(/^\./, "").toLowerCase() || "png";
  return `${projectId}/${flowId}/${stepId}-localized.${safeExtension}`;
}

export function annotatedScreenshotStoragePath(
  projectId: string,
  flowId: string,
  stepId: string,
  extension = "png",
) {
  const safeExtension = extension.replace(/^\./, "").toLowerCase() || "png";
  return `${projectId}/${flowId}/${stepId}-annotated.${safeExtension}`;
}

export function parseScreenshotStoragePath(imagePath: string) {
  const [projectId, flowId, filename] = imagePath.split("/");
  const stepId = filename?.replace(/\.[^.]+$/, "") ?? "";
  return { projectId, flowId, stepId };
}

export function extensionFromMime(mime: string) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}
