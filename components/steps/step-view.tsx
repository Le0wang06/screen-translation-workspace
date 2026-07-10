"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize2,
  PanelsLeftRight,
  PencilRuler,
  SplitSquareHorizontal,
} from "lucide-react";
import type { Editor, TLStoreSnapshot } from "tldraw";

import { DownloadTranslatedButton } from "@/components/steps/download-translated-button";
import { ImageCompareSlider } from "@/components/steps/image-compare-slider";
import { PresentationMode } from "@/components/steps/presentation-mode";
import { ProcessingImagePlaceholder } from "@/components/steps/processing-image-placeholder";
import { RegenerateStepButton } from "@/components/steps/regenerate-step-button";
import { RetryStepButton } from "@/components/steps/retry-step-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Step, StepStatus } from "@/lib/db/types";
import { formatLanguageLabel } from "@/lib/languages";
import { cn } from "@/lib/utils";

const StepCollabCanvas = dynamic(
  () =>
    import("@/components/steps/step-collab-canvas").then(
      (mod) => mod.StepCollabCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(72vh,760px)] items-center justify-center rounded-xl border border-border/70 bg-muted/20 text-sm text-muted-foreground">
        正在加载协作画布…
      </div>
    ),
  },
);

type ViewMode = "split" | "compare" | "collab";

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
  annotatedImageUrl?: string | null;
  annotationDocument?: TLStoreSnapshot | null;
  presentationImages: Record<
    string,
    { original: string | null; translated: string | null }
  >;
};

export function StepView({
  stepId,
  step,
  flowSteps,
  originalImageUrl,
  translatedImageUrl,
  annotatedImageUrl: initialAnnotatedImageUrl = null,
  annotationDocument = null,
  presentationImages,
}: StepViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [presenting, setPresenting] = useState(false);
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState<string | null>(
    initialAnnotatedImageUrl,
  );
  const editorRef = useRef<Editor | null>(null);

  const canCompare = Boolean(originalImageUrl && translatedImageUrl);
  const canCollab = Boolean(translatedImageUrl && step.status === "done");
  const downloadFilename = `${(step.title || "localized-screen")
    .replace(/\s+/g, "-")
    .toLowerCase()}.png`;

  useEffect(() => {
    setAnnotatedImageUrl(initialAnnotatedImageUrl);
  }, [initialAnnotatedImageUrl, stepId]);

  useEffect(() => {
    editorRef.current = null;
  }, [stepId]);

  const getEditor = useCallback(() => editorRef.current, []);

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

      if ((event.key === "a" || event.key === "A") && canCollab) {
        event.preventDefault();
        setViewMode("collab");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canCollab, canCompare]);

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
            并排
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
            对比
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "collab" ? "default" : "outline"}
            className="gap-1.5"
            disabled={!canCollab}
            onClick={() => setViewMode("collab")}
          >
            <PencilRuler className="size-4" aria-hidden />
            协作
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {translatedImageUrl && step.status === "done" ? (
            <DownloadTranslatedButton
              imageUrl={translatedImageUrl}
              annotatedImageUrl={annotatedImageUrl}
              filename={downloadFilename}
              getEditor={viewMode === "collab" ? getEditor : undefined}
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
            演示
          </Button>
        </div>
      </div>

      {viewMode === "collab" && translatedImageUrl ? (
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle className="text-base">协作批注</CardTitle>
            <CardDescription>
              基于 tldraw 在译图上绘制反馈；保存后下载会导出带标记的图片。
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <StepCollabCanvas
              key={stepId}
              stepId={stepId}
              imageUrl={translatedImageUrl}
              initialDocument={annotationDocument}
              onAnnotatedImageChange={setAnnotatedImageUrl}
              onEditorReady={(editor) => {
                editorRef.current = editor;
              }}
            />
          </CardContent>
        </Card>
      ) : viewMode === "compare" && canCompare ? (
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle className="text-base">对比</CardTitle>
            <CardDescription>
              拖动滑块对比原图和译图
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <ImageCompareSlider
              originalUrl={originalImageUrl!}
              translatedUrl={translatedImageUrl!}
              originalAlt={step.title || "原始截图"}
              translatedAlt={step.title || "翻译后截图"}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ScreenCard
            title="原图"
            description="已上传截图"
            imageUrl={originalImageUrl}
            alt={step.title || "原始截图"}
            emptyLabel="原图不可用"
          />
          <ScreenCard
            title="译图"
            description={
              step.status === "processing"
                ? "AI 正在翻译此屏幕。"
                : `已翻译为${formatLanguageLabel(step.target_language)}`
            }
            imageUrl={annotatedImageUrl || translatedImageUrl}
            alt={step.title || "翻译后截图"}
            processing={step.status === "processing"}
            processingOriginalUrl={originalImageUrl}
            emptyLabel="翻译后截图暂不可用。"
            failed={step.status === "failed"}
            errorMessage={step.error_message}
            stepId={stepId}
          />
        </div>
      )}

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
              className="block h-auto w-full"
              decoding="async"
              fetchPriority="high"
              loading="eager"
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
