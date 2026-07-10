const preloadedImages = new Map<string, HTMLImageElement>();

export function preloadBrowserImage(url: string | null | undefined) {
  if (!url || typeof window === "undefined" || preloadedImages.has(url)) {
    return;
  }

  const image = new window.Image();
  image.decoding = "async";
  image.loading = "eager";
  image.src = url;
  preloadedImages.set(url, image);

  void image.decode?.().catch(() => {
    // Keep the network cache warm even if the browser cannot decode eagerly.
  });
}

export function preloadBrowserImages(urls: Array<string | null | undefined>) {
  urls.forEach(preloadBrowserImage);
}
