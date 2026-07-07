"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

type UploadStepButtonProps = {
  flowId: string;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  );
}

function imageFromClipboard(clipboardData: DataTransfer | null) {
  if (!clipboardData) return null;

  for (const item of clipboardData.items) {
    if (item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }

  return null;
}

export function UploadStepButton({ flowId }: UploadStepButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setPending(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/flows/${flowId}/steps`, {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json()) as {
          error?: string;
          step?: { id: string };
        };

        if (!response.ok) {
          setError(payload.error ?? "Failed to upload screenshot.");
          return;
        }

        router.refresh();

        if (payload.step?.id) {
          router.push(`/steps/${payload.step.id}`);
        }
      } catch {
        setError("Failed to upload screenshot.");
      } finally {
        setPending(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [flowId, router],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (pending || isEditableTarget(event.target)) return;

      const file = imageFromClipboard(event.clipboardData);
      if (!file) return;

      event.preventDefault();
      await uploadFile(file);
    },
    [pending, uploadFile],
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void uploadFile(file);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
        disabled={pending}
      />
      <Button
        type="button"
        className="gap-2"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" aria-hidden />
        {pending ? "Uploading…" : "Upload screenshot"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Or press <kbd className="rounded border px-1">⌘V</kbd> /{" "}
        <kbd className="rounded border px-1">Ctrl+V</kbd> anywhere on this page
        after copying a screenshot.
      </p>
      {error ? <FieldError errors={[{ message: error }]} /> : null}
    </div>
  );
}
