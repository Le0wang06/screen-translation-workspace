import Image from "next/image";
import { Loader2, Sparkles } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

type ProcessingImagePlaceholderProps = {
  label?: string;
  originalImageUrl?: string | null;
};

export function ProcessingImagePlaceholder({
  label = "Generating translated screenshot…",
  originalImageUrl,
}: ProcessingImagePlaceholderProps) {
  return (
    <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 overflow-hidden bg-muted/20 p-6">
      {originalImageUrl ? (
        <>
          <Image
            src={originalImageUrl}
            alt=""
            fill
            className="object-contain opacity-20 blur-[1px]"
            sizes="(max-width: 1024px) 100vw, 50vw"
            unoptimized
            aria-hidden
          />
          <div className="absolute inset-0 bg-background/40" aria-hidden />
        </>
      ) : (
        <Skeleton className="absolute inset-4 rounded-xl" />
      )}
      <div className="relative z-10 flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-background/90 shadow-sm ring-1 ring-border/60">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-4 text-primary" aria-hidden />
            {label}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground text-pretty">
            Usually 15–25 seconds. This page updates automatically when ready.
          </p>
        </div>
      </div>
    </div>
  );
}
