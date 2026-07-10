"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
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
  onStepSelect?: (stepId: string) => void;
};

export function StepNavigation({
  steps,
  currentStepId,
  flowId,
  thumbnailUrls,
  onStepSelect,
}: StepNavigationProps) {
  const router = useRouter();
  const { pickFile, pending } = useFlowUpload();
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  const prevStep = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const nextStep =
    currentIndex >= 0 && currentIndex < steps.length - 1
      ? steps[currentIndex + 1]
      : null;
  const goToStep = useCallback(
    (targetStepId: string) => {
      if (onStepSelect) {
        onStepSelect(targetStepId);
      } else {
        router.push(`/steps/${targetStepId}`);
      }
    },
    [onStepSelect, router],
  );

  useEffect(() => {
    if (onStepSelect) return;
    if (prevStep) router.prefetch(`/steps/${prevStep.id}`);
    if (nextStep) router.prefetch(`/steps/${nextStep.id}`);
  }, [nextStep, onStepSelect, prevStep, router]);

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
        goToStep(prevStep.id);
      }

      if (event.key === "ArrowRight" && nextStep) {
        event.preventDefault();
        goToStep(nextStep.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToStep, nextStep, prevStep]);

  if (steps.length <= 1) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/15 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">这是当前流程的第一个屏幕</p>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={pickFile}
          >
            <Plus className="size-4" aria-hidden />
            添加屏幕
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/15 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium tabular-nums">
          第 {currentIndex + 1} / {steps.length} 个屏幕
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
            添加屏幕
          </Button>
          {prevStep ? (
            onStepSelect ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => goToStep(prevStep.id)}
              >
                <ChevronLeft className="size-4" aria-hidden />
                <span className="hidden sm:inline">上一个</span>
              </Button>
            ) : (
              <Link
                href={`/steps/${prevStep.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
              >
                <ChevronLeft className="size-4" aria-hidden />
                <span className="hidden sm:inline">上一个</span>
              </Link>
            )
          ) : (
            <Button variant="outline" size="sm" className="gap-1" disabled>
              <ChevronLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">上一个</span>
            </Button>
          )}
          {nextStep ? (
            onStepSelect ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => goToStep(nextStep.id)}
              >
                <span className="hidden sm:inline">下一个</span>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Link
                href={`/steps/${nextStep.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
              >
                <span className="hidden sm:inline">下一个</span>
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            )
          ) : (
            <Button variant="outline" size="sm" className="gap-1" disabled>
              <span className="hidden sm:inline">下一个</span>
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
        onStepSelect={onStepSelect}
      />

      <p className="text-xs text-muted-foreground">
        横向滚动浏览，拖动手柄调整顺序；也可以用{" "}
        <kbd className="rounded border px-1">←</kbd>{" "}
        <kbd className="rounded border px-1">→</kbd>,{" "}
        <kbd className="rounded border px-1">P</kbd> 演示，{" "}
        <kbd className="rounded border px-1">C</kbd> 对比，{" "}
        <kbd className="rounded border px-1">A</kbd> 协作批注，或直接添加新屏幕。
      </p>
    </section>
  );
}
