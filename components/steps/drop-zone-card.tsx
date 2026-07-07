"use client";

import { ImagePlus } from "lucide-react";

import { useFlowUpload } from "@/components/steps/flow-upload-provider";
import { cn } from "@/lib/utils";

type DropZoneCardProps = {
  compact?: boolean;
};

export function DropZoneCard({ compact = false }: DropZoneCardProps) {
  const { isDragging, pickFile, pending } = useFlowUpload();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!pending) pickFile();
      }}
      onKeyDown={(event) => {
        if (pending) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pickFile();
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors",
        "border-border/80 bg-muted/10 hover:border-primary/40 hover:bg-muted/25",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        pending && "pointer-events-none opacity-60",
        isDragging && "border-primary bg-primary/5 ring-2 ring-primary/20",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-8",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-border/70 bg-background shadow-sm transition-transform group-hover:scale-[1.02]",
          compact ? "size-11" : "size-14",
        )}
      >
        <ImagePlus
          className={cn(
            "text-muted-foreground transition-colors group-hover:text-primary",
            compact ? "size-5" : "size-6",
          )}
          aria-hidden
        />
      </div>
      <div className="space-y-1">
        <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
          {isDragging ? "Drop screenshot here" : "Drop a screenshot here"}
        </p>
        <p className="text-xs text-muted-foreground text-pretty">
          Click to browse, paste with ⌘V, or drag anywhere on this page.
        </p>
      </div>
    </div>
  );
}
