"use client";

import { ClipboardPaste, Upload } from "lucide-react";

import { useFlowUpload } from "@/components/steps/flow-upload-provider";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function UploadStepButton() {
  const {
    pending,
    error,
    pasteFromClipboard,
    pickFile,
  } = useFlowUpload();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="gap-2"
          disabled={pending}
          onClick={pickFile}
        >
          <Upload className="size-4" aria-hidden />
          {pending ? "上传中…" : "添加截图"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={pending}
          onClick={() => void pasteFromClipboard()}
        >
          <ClipboardPaste className="size-4" aria-hidden />
          从剪贴板粘贴
        </Button>
      </div>
      <p className="max-w-md text-xs text-muted-foreground text-pretty">
        按 <kbd className="rounded border px-1">⌘V</kbd> 粘贴，拖入图片，或一次选择多张文件。
      </p>
      {error ? <FieldError errors={[{ message: error }]} /> : null}
    </div>
  );
}
