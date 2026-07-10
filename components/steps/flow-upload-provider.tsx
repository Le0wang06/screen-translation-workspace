"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  imageFromClipboardApi,
  imageFromDataTransfer,
} from "@/components/steps/clipboard-image";
import {
  UploadStatusBar,
  type UploadStatus,
} from "@/components/steps/upload-status-bar";
import { cn } from "@/lib/utils";

type FlowUploadContextValue = {
  pending: boolean;
  error: string | null;
  isDragging: boolean;
  uploadFile: (file: File) => Promise<void>;
  uploadFiles: (files: FileList | File[]) => Promise<void>;
  pasteFromClipboard: () => Promise<void>;
  pickFile: () => void;
  clearError: () => void;
};

const FlowUploadContext = createContext<FlowUploadContextValue | null>(null);

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  );
}

function imageFilesFromFileList(files: FileList | File[]) {
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}

type FlowUploadProviderProps = {
  flowId: string;
  children: React.ReactNode;
};

export function FlowUploadProvider({
  flowId,
  children,
}: FlowUploadProviderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const uploadSingle = useCallback(
    async (file: File): Promise<string | null> => {
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
        throw new Error(payload.error ?? "上传截图失败。");
      }

      return payload.step?.id ?? null;
    },
    [flowId],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const images = imageFilesFromFileList(files);

      if (images.length === 0) {
        setError("请拖入图片文件（PNG、JPG 或 WebP）。");
        return;
      }

      setPending(true);
      setError(null);
      setStatus({ kind: "uploading", current: 0, total: images.length });

      const failures: string[] = [];
      let lastStepId: string | null = null;

      try {
        for (let index = 0; index < images.length; index += 1) {
          setStatus({
            kind: "uploading",
            current: index + 1,
            total: images.length,
          });

          try {
            const stepId = await uploadSingle(images[index]);
            if (stepId) {
              lastStepId = stepId;
            }
          } catch (err) {
            failures.push(
              err instanceof Error ? err.message : "上传失败。",
            );
          }
        }

        if (lastStepId) {
          startTransition(() => {
            router.push(`/steps/${lastStepId}`);
            router.refresh();
          });

          if (failures.length === 0) {
            setStatus({
              kind: "success",
              message:
                images.length > 1
                  ? `已添加 ${images.length} 个屏幕，正在后台翻译`
                  : "截图已添加，正在后台翻译",
            });
          }
        }

        if (failures.length > 0) {
          const message =
            failures.length === images.length
              ? failures[0]
              : `${failures.length} 个上传失败，其余已添加。`;
          setError(message);
          setStatus({ kind: "error", message });
        } else if (!lastStepId) {
          setError("上传截图失败。");
          setStatus({ kind: "error", message: "上传截图失败。" });
        }
      } catch {
        setError("上传截图失败。");
        setStatus({ kind: "error", message: "上传截图失败。" });
      } finally {
        setPending(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [router, startTransition, uploadSingle],
  );

  const uploadFile = useCallback(
    async (file: File) => uploadFiles([file]),
    [uploadFiles],
  );

  const pasteFromClipboard = useCallback(async () => {
    if (pending) return;

    try {
      const file = await imageFromClipboardApi();
      if (!file) {
        setError(
          "剪贴板里没有图片。在 Mac 上可以用 ⌘⇧⌃4 将截图复制到剪贴板。",
        );
        return;
      }

      await uploadFile(file);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "无法读取剪贴板图片。";
      setError(message);
    }
  }, [pending, uploadFile]);

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (pending || isEditableTarget(event.target)) return;

      let file = imageFromDataTransfer(event.clipboardData);

      if (!file) {
        try {
          file = await imageFromClipboardApi();
        } catch {
          return;
        }
      }

      if (!file) return;

      event.preventDefault();
      await uploadFile(file);
    },
    [pending, uploadFile],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste, true);
    return () => document.removeEventListener("paste", handlePaste, true);
  }, [handlePaste]);

  useEffect(() => {
    if (!status || status.kind === "uploading") return;

    const timeoutId = setTimeout(() => {
      setStatus(null);
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [status]);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files?.length) {
        void uploadFiles(files);
      }
    },
    [uploadFiles],
  );

  const pickFile = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (pending) return;

      await uploadFiles(event.dataTransfer.files);
    },
    [pending, uploadFiles],
  );

  return (
    <FlowUploadContext.Provider
      value={{
        pending,
        error,
        isDragging,
        uploadFile,
        uploadFiles,
        pasteFromClipboard,
        pickFile,
        clearError,
      }}
    >
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col gap-8 rounded-xl transition-colors",
          isDragging && "bg-muted/40 ring-2 ring-primary/30 ring-offset-2",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={onInputChange}
          disabled={pending}
        />
        {isDragging ? (
          <div
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-primary/5 backdrop-blur-[1px]"
            aria-hidden
          >
            <div className="rounded-2xl border border-primary/30 bg-background/95 px-6 py-4 text-center shadow-lg">
              <p className="text-sm font-medium">放开即可添加截图</p>
              <p className="mt-1 text-xs text-muted-foreground">
                可拖入一张或多张图片，系统会按顺序上传
              </p>
            </div>
          </div>
        ) : null}
        {children}
        <UploadStatusBar
          status={status}
          onDismiss={() => setStatus(null)}
        />
      </div>
    </FlowUploadContext.Provider>
  );
}

export function useFlowUpload() {
  const context = useContext(FlowUploadContext);
  if (!context) {
    throw new Error("useFlowUpload 必须在 FlowUploadProvider 内使用。");
  }
  return context;
}
