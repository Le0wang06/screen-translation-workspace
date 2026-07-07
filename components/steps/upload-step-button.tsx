"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

type UploadStepButtonProps = {
  flowId: string;
};

export function UploadStepButton({ flowId }: UploadStepButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File) {
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
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void uploadFile(file);
    }
  }

  async function handlePaste(event: React.ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          await uploadFile(file);
          return;
        }
      }
    }
  }

  return (
    <div className="flex flex-col gap-2" onPaste={handlePaste}>
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
        Or paste an image from your clipboard.
      </p>
      {error ? <FieldError errors={[{ message: error }]} /> : null}
    </div>
  );
}
