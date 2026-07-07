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
  registerInput: (input: HTMLInputElement | null) => void;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
        throw new Error(payload.error ?? "Failed to upload screenshot.");
      }

      return payload.step?.id ?? null;
    },
    [flowId],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const images = imageFilesFromFileList(files);

      if (images.length === 0) {
        setError("Drop an image file (PNG, JPG, or WebP).");
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
              err instanceof Error ? err.message : "Upload failed.",
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
                  ? `${images.length} screens added — translating in background`
                  : "Screenshot added — translating in background",
            });
          }
        }

        if (failures.length > 0) {
          const message =
            failures.length === images.length
              ? failures[0]
              : `${failures.length} upload${failures.length === 1 ? "" : "s"} failed. Others were added.`;
          setError(message);
          setStatus({ kind: "error", message });
        } else if (!lastStepId) {
          setError("Failed to upload screenshot.");
          setStatus({ kind: "error", message: "Failed to upload screenshot." });
        }
      } catch {
        setError("Failed to upload screenshot.");
        setStatus({ kind: "error", message: "Failed to upload screenshot." });
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
          "No image found on clipboard. On Mac, use ⌘⇧⌃4 to copy a screenshot to clipboard.",
        );
        return;
      }

      await uploadFile(file);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not read image from clipboard.";
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

  const registerInput = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
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
        registerInput,
        onInputChange,
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
        {isDragging ? (
          <div
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-primary/5 backdrop-blur-[1px]"
            aria-hidden
          >
            <div className="rounded-2xl border border-primary/30 bg-background/95 px-6 py-4 text-center shadow-lg">
              <p className="text-sm font-medium">Drop to add screenshot</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Drop one or more images — they&apos;ll upload in order
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
    throw new Error("useFlowUpload must be used within FlowUploadProvider.");
  }
  return context;
}
