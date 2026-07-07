"use client";

import { Loader2, Sparkles, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

type UploadOverlayProps = {
  open: boolean;
  message?: string;
};

export function UploadOverlay({
  open,
  message = "Uploading screenshot…",
}: UploadOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card p-6 shadow-xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Upload className="size-6" aria-hidden />
            <Loader2
              className="absolute -right-1 -bottom-1 size-5 animate-spin text-primary"
              aria-hidden
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{message}</p>
            <p className="text-xs text-muted-foreground text-pretty">
              You&apos;ll land on the step page while translation runs in the
              background.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 text-left text-xs text-muted-foreground">
            <StepRow active label="Uploading original screenshot" />
            <StepRow label="Generating translated screen" />
            <StepRow label="Ready to review" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepRow({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "size-2 rounded-full",
          active ? "animate-pulse bg-primary" : "bg-muted-foreground/30",
        )}
        aria-hidden
      />
      <span className={cn(active && "font-medium text-foreground")}>{label}</span>
      {active ? (
        <Sparkles className="ml-auto size-3.5 text-primary" aria-hidden />
      ) : null}
    </div>
  );
}
