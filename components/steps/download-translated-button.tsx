import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

type DownloadTranslatedButtonProps = {
  imageUrl: string;
  filename?: string;
};

export function DownloadTranslatedButton({
  imageUrl,
  filename = "localized-screen.png",
}: DownloadTranslatedButtonProps) {
  return (
    <Button
      render={
        <a
          href={imageUrl}
          download={filename}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
    >
      <Download className="size-4" aria-hidden />
      Download
    </Button>
  );
}
