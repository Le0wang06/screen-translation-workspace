"use client";

import { useEffect, useState } from "react";
import { Maximize2, PanelsLeftRight, SplitSquareHorizontal } from "lucide-react";

import { DownloadTranslatedButton } from "@/components/steps/download-translated-button";
import { ImageCompareSlider } from "@/components/steps/image-compare-slider";
import { PresentationMode } from "@/components/steps/presentation-mode";
import { ProcessingImagePlaceholder } from "@/components/steps/processing-image-placeholder";
import { RegenerateStepButton } from "@/components/steps/regenerate-step-button";
import { RetryStepButton } from "@/components/steps/retry-step-button";
import { StepComments } from "@/components/steps/step-comments";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Comment, Step, StepStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type ViewMode = "split" | "compare";

type StepViewProps = {
  stepId: string;
  step: {
    title: string | null;
    summary: string | null;
    status: StepStatus;
    target_language: string;
    error_message: string | null;
  };
  flowSteps: Step[];
  originalImageUrl: string | null;
  translatedImageUrl: string | null;
  presentationImages: Record<
    string,
    { original: string | null; translated: string | null }
  >;
  initialComments: Comment[];
  authorEmails: Record<string, string>;
};

export function StepView({
  stepId,
  step,
  flowSteps,
  originalImageUrl,
  translatedImageUrl,
  presentationImages,
  initialComments,
  authorEmails,
}: StepViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [presenting, setPresenting] = useState(false);

  const canCompare = Boolean(originalImageUrl && translatedImageUrl);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        setPresenting(true);
      }

      if ((event.key === "c" || event.key === "C") && canCompare) {
        event.preventDefault();
        setViewMode("compare");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canCompare]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "split" ? "default" : "outline"}
            className="gap-1.5"
            onClick={() => setViewMode("split")}
          >
            <PanelsLeftRight className="size-4" aria-hidden />
            Side by side
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "compare" ? "default" : "outline"}
            className="gap-1.5"
            disabled={!canCompare}
            onClick={() => setViewMode("compare")}
          >
            <SplitSquareHorizontal className="size-4" aria-hidden />
            Compare
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {translatedImageUrl && step.status === "done" ? (
            <DownloadTranslatedButton
              imageUrl={translatedImageUrl}
              filename={`${(step.title || "localized-screen").replace(/\s+/g, "-").toLowerCase()}.png`}
            />
          ) : null}
          <RegenerateStepButton
            stepId={stepId}
            disabled={step.status === "processing" || !originalImageUrl}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setPresenting(true)}
          >
            <Maximize2 className="size-4" aria-hidden />
            Present
          </Button>
        </div>
      </div>

      {viewMode === "compare" && canCompare ? (
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle className="text-base">Compare</CardTitle>
            <CardDescription>
              Drag the slider to compare Original and Translated
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <ImageCompareSlider
              originalUrl={originalImageUrl!}
              translatedUrl={translatedImageUrl!}
              originalAlt={step.title || "Original screenshot"}
              translatedAlt={step.title || "Translated screenshot"}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ScreenCard
            title="Original"
            description="Uploaded screenshot"
            imageUrl={originalImageUrl}
            alt={step.title || "Original screenshot"}
            emptyLabel="Original unavailable"
          />
          <ScreenCard
            title="Translated"
            description={
              step.status === "processing"
                ? "AI is translating text on this screen."
                : `Text translated to ${step.target_language}`
            }
            imageUrl={translatedImageUrl}
            alt={step.title || "Translated screenshot"}
            processing={step.status === "processing"}
            processingOriginalUrl={originalImageUrl}
            emptyLabel="Translated screenshot not available yet."
            failed={step.status === "failed"}
            errorMessage={step.error_message}
            stepId={stepId}
          />
        </div>
      )}

      <StepComments
        stepId={stepId}
        initialComments={initialComments}
        authorEmails={authorEmails}
      />

      {presenting ? (
        <PresentationMode
          steps={flowSteps}
          currentStepId={stepId}
          imageUrls={presentationImages}
          onClose={() => setPresenting(false)}
        />
      ) : null}
    </>
  );
}

type ScreenCardProps = {
  title: string;
  description: string;
  imageUrl: string | null;
  alt: string;
  emptyLabel: string;
  processing?: boolean;
  processingOriginalUrl?: string | null;
  failed?: boolean;
  errorMessage?: string | null;
  stepId?: string;
};

function ScreenCard({
  title,
  description,
  imageUrl,
  alt,
  emptyLabel,
  processing,
  processingOriginalUrl,
  failed,
  errorMessage,
  stepId,
}: ScreenCardProps) {
  return (
    <Card className={cn("overflow-hidden border-border/70 shadow-sm")}>
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {processing ? (
          <ProcessingImagePlaceholder originalImageUrl={processingOriginalUrl} />
        ) : imageUrl ? (
          <div className="relative w-full bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={alt}
              className="block h-auto w-full animate-in fade-in duration-500"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
            <p>{emptyLabel}</p>
            {failed && errorMessage ? (
              <p className="max-w-md rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {errorMessage}
              </p>
            ) : null}
            {failed && stepId ? <RetryStepButton stepId={stepId} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
