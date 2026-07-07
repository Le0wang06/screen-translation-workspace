"use client";

import { CheckCircle2, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UploadStatus =
  | { kind: "uploading"; current: number; total: number }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type UploadStatusBarProps = {
  status: UploadStatus | null;
  onDismiss?: () => void;
};

export function UploadStatusBar({ status, onDismiss }: UploadStatusBarProps) {
  if (!status) return null;

  const isUploading = status.kind === "uploading";
  const isSuccess = status.kind === "success";
  const isError = status.kind === "error";

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-50 w-[min(100%-2rem,28rem)] -translate-x-1/2",
        "rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        isSuccess && "border-emerald-500/30",
        isError && "border-destructive/30",
        isUploading && "border-primary/30",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
            isUploading && "bg-primary/10 text-primary",
            isSuccess && "bg-emerald-500/10 text-emerald-600",
            isError && "bg-destructive/10 text-destructive",
          )}
        >
          {isUploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : isSuccess ? (
            <CheckCircle2 className="size-4" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          {isUploading ? (
            <>
              <p className="text-sm font-medium">
                {status.total > 1
                  ? `Uploading screen ${status.current} of ${status.total}`
                  : "Uploading screenshot…"}
              </p>
              <p className="text-xs text-muted-foreground">
                Translation starts right after upload. You can keep browsing.
              </p>
            </>
          ) : (
            <p
              className={cn(
                "text-sm font-medium",
                isError && "text-destructive",
                isSuccess && "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {status.message}
            </p>
          )}
        </div>

        {!isUploading && onDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      {isUploading && status.total > 1 ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(status.current / status.total) * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
