"use client";

import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import type { Editor } from "tldraw";

import { exportAnnotatedPng } from "@/components/steps/export-annotated";
import { Button } from "@/components/ui/button";

type DownloadTranslatedButtonProps = {
  imageUrl: string;
  annotatedImageUrl?: string | null;
  filename?: string;
  getEditor?: () => Editor | null;
};

async function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

async function downloadFromUrl(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("下载失败。");
  }
  const blob = await response.blob();
  await downloadBlob(blob, filename);
}

export function DownloadTranslatedButton({
  imageUrl,
  annotatedImageUrl = null,
  filename = "localized-screen.png",
  getEditor,
}: DownloadTranslatedButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const includesMarkup = Boolean(annotatedImageUrl || getEditor);

  const onClick = useCallback(async () => {
    setPending(true);
    setError(null);

    try {
      const editor = getEditor?.() ?? null;
      if (editor) {
        const blob = await exportAnnotatedPng(editor);
        await downloadBlob(blob, filename);
        return;
      }

      await downloadFromUrl(annotatedImageUrl || imageUrl, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "下载失败。");
    } finally {
      setPending(false);
    }
  }, [annotatedImageUrl, filename, getEditor, imageUrl]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={pending}
        onClick={() => void onClick()}
      >
        <Download className="size-4" aria-hidden />
        {pending ? "准备中…" : includesMarkup ? "下载（含批注）" : "下载"}
      </Button>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
