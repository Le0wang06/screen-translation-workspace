"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { StepFilmstrip } from "@/components/steps/step-filmstrip";
import { useFlowUpload } from "@/components/steps/flow-upload-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Step } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type StepNavigationProps = {
  steps: Step[];
  currentStepId: string;
  flowId: string;
  thumbnailUrls: Record<string, string | null>;
};

export function StepNavigation({
  steps,
  currentStepId,
  flowId,
  thumbnailUrls,
}: StepNavigationProps) {
  const router = useRouter();
  const { pickFile, pending } = useFlowUpload();
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  const prevStep = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const nextStep =
    currentIndex >= 0 && currentIndex < steps.length - 1
      ? steps[currentIndex + 1]
      : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      if (event.key === "ArrowLeft" && prevStep) {
        event.preventDefault();
        router.push(`/steps/${prevStep.id}`);
      }

      if (event.key === "ArrowRight" && nextStep) {
        event.preventDefault();
        router.push(`/steps/${nextStep.id}`);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextStep, prevStep, router]);

  if (steps.length <= 1) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/15 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">First screen in this flow</p>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={pickFile}
          >
            <Plus className="size-4" aria-hidden />
            Add screen
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/15 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium tabular-nums">
          Screen {currentIndex + 1} of {steps.length}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={pending}
            onClick={pickFile}
          >
            <Plus className="size-4" aria-hidden />
            Add screen
          </Button>
          {prevStep ? (
            <Link
              href={`/steps/${prevStep.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
            >
              <ChevronLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">Previous</span>
            </Link>
          ) : (
            <Button variant="outline" size="sm" className="gap-1" disabled>
              <ChevronLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">Previous</span>
            </Button>
          )}
          {nextStep ? (
            <Link
              href={`/steps/${nextStep.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <Button variant="outline" size="sm" className="gap-1" disabled>
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <StepFilmstrip
        steps={steps}
        thumbnailUrls={thumbnailUrls}
        currentStepId={currentStepId}
        flowId={flowId}
      />

      <p className="text-xs text-muted-foreground">
        Scroll the strip, drag the grip to reorder, use{" "}
        <kbd className="rounded border px-1">←</kbd>{" "}
        <kbd className="rounded border px-1">→</kbd>,{" "}
        <kbd className="rounded border px-1">P</kbd> to present,{" "}
        <kbd className="rounded border px-1">C</kbd> to compare, or add another
        screen without leaving this page.
      </p>
    </section>
  );
}
