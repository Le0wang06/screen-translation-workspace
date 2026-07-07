export type ImageOutputFormat = "png" | "jpeg" | "webp";

export function extensionFromPath(path: string) {
  const match = path.match(/\.([^.]+)$/i);
  return match?.[1]?.toLowerCase() ?? "png";
}

export function mimeFromExtension(extension: string) {
  switch (extension.replace(/^\./, "").toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

export function openAiOutputFormatFromMime(mime: string): ImageOutputFormat {
  switch (mime) {
    case "image/jpeg":
      return "jpeg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

export function contentTypeFromExtension(extension: string) {
  return mimeFromExtension(extension);
}

export function storageExtensionFromMime(mime: string) {
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

export function resolveSourceImageFormat(imagePath: string, fileType?: string | null) {
  const pathExtension = extensionFromPath(imagePath);
  const mime = fileType?.startsWith("image/") ? fileType : mimeFromExtension(pathExtension);
  const openAiFormat = openAiOutputFormatFromMime(mime);
  const storageExtension =
    openAiFormat === "jpeg"
      ? "jpg"
      : openAiFormat === "webp"
        ? "webp"
        : "png";

  return {
    mime,
    openAiFormat,
    storageExtension,
  };
}
