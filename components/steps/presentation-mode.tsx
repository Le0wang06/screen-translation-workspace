"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { Step } from "@/lib/db/types";
import { SCREENSHOTS_BUCKET } from "@/lib/storage/screenshots";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type PresentationModeProps = {
  steps: Step[];
  currentStepId: string;
  onClose: () => void;
};

export function PresentationMode({
  steps,
  currentStepId,
  onClose,
}: PresentationModeProps) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      steps.findIndex((step) => step.id === currentStepId),
    ),
  );
  const [imageUrls, setImageUrls] = useState<
    Record<string, { original: string | null; translated: string | null }>
  >({});

  const step = steps[index];
  const urls = step ? imageUrls[step.id] : null;
  const displayUrl = urls?.translated ?? urls?.original;

  const goPrev = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    setIndex((current) => Math.min(steps.length - 1, current + 1));
  }, [steps.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, onClose]);

  useEffect(() => {
    const indexes = [index - 1, index, index + 1].filter(
      (candidate) => candidate >= 0 && candidate < steps.length,
    );
    const stepsToLoad = indexes
      .map((candidate) => steps[candidate])
      .filter((candidate) => candidate && !imageUrls[candidate.id]);

    if (stepsToLoad.length === 0) return;

    let cancelled = false;
    const supabase = createClient();
    const paths = stepsToLoad.flatMap((candidate) =>
      [candidate.image_url, candidate.translated_image_url].filter(
        (path): path is string => Boolean(path),
      ),
    );

    async function loadUrls() {
      if (paths.length === 0) {
        setImageUrls((current) => ({
          ...current,
          ...Object.fromEntries(
            stepsToLoad.map((candidate) => [
              candidate.id,
              { original: null, translated: null },
            ]),
          ),
        }));
        return;
      }

      const { data } = await supabase.storage
        .from(SCREENSHOTS_BUCKET)
        .createSignedUrls(paths, 3600);

      if (cancelled) return;

      const byPath = new Map<string, string | null>();
      data?.forEach((item, itemIndex) => {
        const path = item.path ?? paths[itemIndex];
        if (path) {
          byPath.set(path, item.signedUrl ?? null);
        }
      });

      setImageUrls((current) => ({
        ...current,
        ...Object.fromEntries(
          stepsToLoad.map((candidate) => [
            candidate.id,
            {
              original: candidate.image_url
                ? byPath.get(candidate.image_url) ?? null
                : null,
              translated: candidate.translated_image_url
                ? byPath.get(candidate.translated_image_url) ?? null
                : null,
            },
          ]),
        ),
      }));
    }

    void loadUrls();

    return () => {
      cancelled = true;
    };
  }, [imageUrls, index, steps]);

  if (!step) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {step.title || `第 ${index + 1} 个屏幕`}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {index + 1} / {steps.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            onClick={goPrev}
            disabled={index === 0}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            onClick={goNext}
            disabled={index >= steps.length - 1}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <Link
            href={`/steps/${step.id}`}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            退出
          </Link>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            onClick={onClose}
            aria-label="关闭演示"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>
      <div className="relative flex flex-1 items-center justify-center bg-muted/20 p-4 sm:p-8">
        {displayUrl ? (
          <div className="relative h-full w-full max-w-6xl">
            <Image
              src={displayUrl}
              alt={step.title || "演示屏幕"}
              fill
              className="object-contain"
              sizes="100vw"
              unoptimized
              priority
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {step.status === "processing"
              ? "此屏幕仍在处理中…"
              : "正在加载屏幕…"}
          </p>
        )}
      </div>
    </div>
  );
}
