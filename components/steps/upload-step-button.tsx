"use client";

import { useEffect, useRef } from "react";
import { ClipboardPaste, Upload } from "lucide-react";

import { useFlowUpload } from "@/components/steps/flow-upload-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function UploadStepButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    pending,
    error,
    pasteFromClipboard,
    pickFile,
    registerInput,
    onInputChange,
  } = useFlowUpload();

  useEffect(() => {
    registerInput(inputRef.current);
    return () => registerInput(null);
  }, [registerInput]);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={onInputChange}
        disabled={pending}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="gap-2"
          disabled={pending}
          onClick={pickFile}
        >
          <Upload className="size-4" aria-hidden />
          {pending ? "Uploading…" : "Add screenshot"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={pending}
          onClick={() => void pasteFromClipboard()}
        >
          <ClipboardPaste className="size-4" aria-hidden />
          Paste from clipboard
        </Button>
      </div>
      <p className="max-w-md text-xs text-muted-foreground text-pretty">
        Paste with <kbd className="rounded border px-1">⌘V</kbd>, drag one or
        more images, or pick multiple files at once.
      </p>
      {error ? <FieldError errors={[{ message: error }]} /> : null}
    </div>
  );
}
