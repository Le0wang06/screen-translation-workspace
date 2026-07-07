import { Loader2, Sparkles } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

type ProcessingImagePlaceholderProps = {
  label?: string;
};

export function ProcessingImagePlaceholder({
  label = "Generating translated screenshot…",
}: ProcessingImagePlaceholderProps) {
  return (
    <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 overflow-hidden bg-muted/20 p-6">
      <Skeleton className="absolute inset-4 rounded-xl" />
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
            This usually takes a minute. The page will update automatically when
            it&apos;s ready.
          </p>
        </div>
      </div>
    </div>
  );
}
