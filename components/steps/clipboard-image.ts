const IMAGE_TYPE_PATTERN = /^image\//i;

function isImageClipboardType(type: string) {
  return (
    IMAGE_TYPE_PATTERN.test(type) ||
    type === "public.png" ||
    type === "public.tiff" ||
    type.includes("png") ||
    type.includes("tiff")
  );
}

function normalizeImageFile(file: File, fallbackName = "screenshot.png") {
  if (file.type && IMAGE_TYPE_PATTERN.test(file.type)) {
    return file;
  }

  if (file.size === 0) {
    return null;
  }

  return new File([file], fallbackName, { type: "image/png" });
}

export function imageFromDataTransfer(clipboardData: DataTransfer | null) {
  if (!clipboardData) return null;

  for (const file of clipboardData.files) {
    const normalized = normalizeImageFile(file);
    if (normalized) return normalized;
  }

  for (const item of clipboardData.items) {
    if (item.kind !== "file") continue;

    const file = item.getAsFile();
    if (!file) continue;

    if (isImageClipboardType(item.type) || isImageClipboardType(file.type)) {
      return normalizeImageFile(file) ?? file;
    }

    // macOS screenshots sometimes arrive with opaque MIME types.
    if (
      item.type === "application/octet-stream" ||
      !item.type
    ) {
      const normalized = normalizeImageFile(file);
      if (normalized) return normalized;
    }
  }

  return null;
}

export async function imageFromClipboardApi() {
  if (!navigator.clipboard?.read) {
    throw new Error("当前浏览器不支持读取剪贴板。");
  }

  const items = await navigator.clipboard.read();

  for (const item of items) {
    const imageType = item.types.find(isImageClipboardType);

    if (!imageType) continue;

    const blob = await item.getType(imageType);
    return new File([blob], "screenshot.png", {
      type: IMAGE_TYPE_PATTERN.test(imageType) ? imageType : "image/png",
    });
  }

  return null;
}

export function imageFromFileList(files: FileList | null) {
  if (!files?.length) return null;

  for (const file of files) {
    const normalized = normalizeImageFile(file);
    if (normalized) return normalized;
  }

  return null;
}
