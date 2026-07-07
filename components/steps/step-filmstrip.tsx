"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { StepStatusBadge } from "@/components/steps/step-status-badge";
import type { Step } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type StepFilmstripProps = {
  steps: Step[];
  thumbnailUrls: Record<string, string | null>;
  currentStepId?: string;
  className?: string;
};

export function StepFilmstrip({
  steps,
  thumbnailUrls,
  currentStepId,
  className,
}: StepFilmstripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [currentStepId]);

  if (steps.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent"
        aria-hidden
      />

      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:thin] snap-x snap-mandatory"
      >
        {steps.map((step, index) => {
          const thumbnailUrl = thumbnailUrls[step.id];
          const isActive = step.id === currentStepId;

          return (
            <Link
              key={step.id}
              ref={isActive ? activeRef : undefined}
              href={`/steps/${step.id}`}
              className={cn(
                "group flex w-36 shrink-0 snap-start flex-col gap-2 rounded-xl border p-2 transition-colors sm:w-40",
                isActive
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : "border-border/70 bg-card hover:border-border hover:bg-muted/30",
              )}
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                {thumbnailUrl ? (
                  <Image
                    src={thumbnailUrl}
                    alt=""
                    fill
                    className="object-cover object-top"
                    sizes="160px"
                    unoptimized
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    —
                  </div>
                )}
                <span className="absolute top-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm">
                  {index + 1}
                </span>
              </div>
              <div className="min-w-0 space-y-1 px-0.5">
                <p className="truncate text-xs font-medium">
                  {step.title || `Step ${index + 1}`}
                </p>
                <StepStatusBadge status={step.status} className="text-[10px]" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
