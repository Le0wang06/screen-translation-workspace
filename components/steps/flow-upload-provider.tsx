"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  imageFromClipboardApi,
  imageFromDataTransfer,
} from "@/components/steps/clipboard-image";
import { cn } from "@/lib/utils";

type FlowUploadContextValue = {
  pending: boolean;
  error: string | null;
  isDragging: boolean;
  uploadFile: (file: File) => Promise<void>;
  pasteFromClipboard: () => Promise<void>;
  pickFile: () => void;
  registerInput: (input: HTMLInputElement | null) => void;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

const FlowUploadContext = createContext<FlowUploadContextValue | null>(null);

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  );
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void uploadFile(file);
      }
    },
    [uploadFile],
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

      const file = event.dataTransfer.files?.[0];
      if (file?.type.startsWith("image/")) {
        await uploadFile(file);
      } else {
        setError("Drop an image file (PNG, JPG, or WebP).");
      }
    },
    [pending, uploadFile],
  );

  return (
    <FlowUploadContext.Provider
      value={{
        pending,
        error,
        isDragging,
        uploadFile,
        pasteFromClipboard,
        pickFile,
        registerInput,
        onInputChange,
      }}
    >
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col gap-8 rounded-xl transition-colors",
          isDragging && "bg-muted/40 ring-2 ring-primary/30 ring-offset-2",
        )}
      >
        {children}
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
