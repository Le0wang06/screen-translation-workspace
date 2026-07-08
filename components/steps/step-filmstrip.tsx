"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";

import { StepStatusBadge } from "@/components/steps/step-status-badge";
import type { Step } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type StepFilmstripProps = {
  steps: Step[];
  thumbnailUrls: Record<string, string | null>;
  currentStepId?: string;
  flowId?: string;
  className?: string;
};

export function StepFilmstrip({
  steps,
  thumbnailUrls,
  currentStepId,
  flowId,
  className,
}: StepFilmstripProps) {
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [orderedSteps, setOrderedSteps] = useState<Step[] | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const displaySteps = orderedSteps ?? steps;

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [currentStepId]);

  async function persistOrder(nextSteps: Step[]) {
    if (!flowId) return;

    setReordering(true);
    try {
      const response = await fetch(`/api/flows/${flowId}/steps/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepIds: nextSteps.map((step) => step.id) }),
      });

      if (!response.ok) {
        setOrderedSteps(null);
        return;
      }

      setOrderedSteps(null);
      router.refresh();
    } catch {
      setOrderedSteps(null);
    } finally {
      setReordering(false);
    }
  }

  function reorder(dragId: string, targetId: string) {
    if (dragId === targetId) return;

    const current = orderedSteps ?? steps;
    const dragIndex = current.findIndex((step) => step.id === dragId);
    const targetIndex = current.findIndex((step) => step.id === targetId);

    if (dragIndex < 0 || targetIndex < 0) return;

    const next = [...current];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setOrderedSteps(next);
    void persistOrder(next);
  }

  if (displaySteps.length === 0) return null;

  const reorderable = Boolean(flowId);

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
        className={cn(
          "flex gap-3 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:thin] snap-x snap-mandatory",
          reordering && "opacity-80",
        )}
      >
        {displaySteps.map((step, index) => {
          const thumbnailUrl = thumbnailUrls[step.id];
          const isActive = step.id === currentStepId;
          const isDragOver = dragOverId === step.id && draggedId !== step.id;

          return (
            <div
              key={step.id}
              className={cn(
                "flex w-36 shrink-0 snap-start gap-1 sm:w-40",
                isDragOver && "opacity-70",
              )}
              onDragOver={(event) => {
                if (!reorderable || !draggedId) return;
                event.preventDefault();
                setDragOverId(step.id);
              }}
              onDragLeave={() => {
                if (dragOverId === step.id) {
                  setDragOverId(null);
                }
              }}
              onDrop={(event) => {
                if (!reorderable || !draggedId) return;
                event.preventDefault();
                reorder(draggedId, step.id);
                setDraggedId(null);
                setDragOverId(null);
              }}
            >
              {reorderable ? (
                <button
                  type="button"
                  draggable
                  className="mt-3 flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted/60 active:cursor-grabbing"
                  aria-label={`Reorder ${step.title || `step ${index + 1}`}`}
                  onDragStart={() => setDraggedId(step.id)}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                >
                  <GripVertical className="size-4" aria-hidden />
                </button>
              ) : null}

              <Link
                ref={isActive ? activeRef : undefined}
                href={`/steps/${step.id}`}
                className={cn(
                  "group flex min-w-0 flex-1 flex-col gap-2 rounded-xl border p-2 transition-colors",
                  isActive
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "border-border/70 bg-card hover:border-border hover:bg-muted/30",
                  draggedId === step.id && "opacity-50",
                )}
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                  {thumbnailUrl ? (
                    <Image
                      src={thumbnailUrl}
                      alt={step.title || `Screen ${index + 1}`}
                      fill
                      className="object-contain object-top"
                      sizes="160px"
                      unoptimized
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                  {step.status === "processing" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
                      <span className="rounded-full bg-background/90 px-2 py-1 text-[10px] font-medium text-primary shadow-sm">
                        Processing
                      </span>
                    </div>
                  ) : null}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
