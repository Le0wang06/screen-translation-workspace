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
