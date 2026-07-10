"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { DeleteStepButton } from "@/components/steps/delete-step-button";
import { RetryStepButton } from "@/components/steps/retry-step-button";
import { StepEditableHeader } from "@/components/steps/step-editable-header";
import { StepNavigation } from "@/components/steps/step-navigation";
import { StepStatusBadge } from "@/components/steps/step-status-badge";
import { StepView } from "@/components/steps/step-view";
import type { Comment, Step } from "@/lib/db/types";
import { preloadBrowserImages } from "@/lib/preload-image";

type StepImages = {
  original: string | null;
  translated: string | null;
};

type FlowStepWorkspaceProps = {
  initialStepId: string;
  project: {
    id: string;
    name: string;
  };
  flow: {
    id: string;
    name: string;
  };
  steps: Step[];
  thumbnailUrls: Record<string, string | null>;
  imageUrls: Record<string, StepImages>;
  commentsByStepId: Record<string, Comment[]>;
  authorEmails: Record<string, string>;
};

function stepIdFromPath(pathname: string) {
  const match = pathname.match(/^\/steps\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function FlowStepWorkspace({
  initialStepId,
  project,
  flow,
  steps,
  thumbnailUrls,
  imageUrls,
  commentsByStepId,
  authorEmails,
}: FlowStepWorkspaceProps) {
  const stepIds = useMemo(() => new Set(steps.map((step) => step.id)), [steps]);
  const fallbackStepId = steps[0]?.id ?? initialStepId;
  const [currentStepId, setCurrentStepId] = useState(() =>
    stepIds.has(initialStepId) ? initialStepId : fallbackStepId,
  );

  const matchedIndex = steps.findIndex((step) => step.id === currentStepId);
  const currentIndex = matchedIndex >= 0 ? matchedIndex : 0;
  const currentStep = steps[currentIndex] ?? null;
  const currentImages = currentStep ? imageUrls[currentStep.id] : null;

  const selectStep = useCallback(
    (stepId: string, mode: "push" | "replace" = "push") => {
      if (!stepIds.has(stepId)) return;

      setCurrentStepId(stepId);

      const nextPath = `/steps/${stepId}`;
      if (window.location.pathname === nextPath) return;

      if (mode === "replace") {
        window.history.replaceState(null, "", nextPath);
      } else {
        window.history.pushState(null, "", nextPath);
      }
    },
    [stepIds],
  );

  useEffect(() => {
    function onPopState() {
      const pathStepId = stepIdFromPath(window.location.pathname);
      if (pathStepId && stepIds.has(pathStepId)) {
        setCurrentStepId(pathStepId);
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [stepIds]);

  useEffect(() => {
    if (currentIndex < 0) return;

    for (const index of [
      currentIndex - 2,
      currentIndex - 1,
      currentIndex,
      currentIndex + 1,
      currentIndex + 2,
    ]) {
      const step = steps[index];
      if (!step) continue;
      preloadBrowserImages([
        imageUrls[step.id]?.original,
        imageUrls[step.id]?.translated,
        thumbnailUrls[step.id],
      ]);
    }
  }, [currentIndex, imageUrls, steps, thumbnailUrls]);

  if (!currentStep) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageBreadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: project.name, href: `/projects/${project.id}` },
            { label: flow.name, href: `/flows/${flow.id}` },
            { label: currentStep.title || "Screen" },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <StepEditableHeader
            key={currentStep.id}
            stepId={currentStep.id}
            title={currentStep.title}
            summary={currentStep.summary}
          />
          <div className="flex flex-wrap items-center gap-2">
            <StepStatusBadge status={currentStep.status} />
            <DeleteStepButton
              stepId={currentStep.id}
              flowId={flow.id}
              stepTitle={currentStep.title}
            />
          </div>
        </div>
        {currentStep.status === "failed" && currentStep.error_message ? (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">
              {currentStep.error_message}
            </p>
            <RetryStepButton stepId={currentStep.id} />
          </div>
        ) : null}
      </section>

      <StepNavigation
        steps={steps}
        currentStepId={currentStep.id}
        flowId={flow.id}
        thumbnailUrls={thumbnailUrls}
        onStepSelect={selectStep}
      />

      <StepView
        stepId={currentStep.id}
        step={{
          title: currentStep.title,
          summary: currentStep.summary,
          status: currentStep.status,
          target_language: currentStep.target_language,
          error_message: currentStep.error_message,
        }}
        flowSteps={steps}
        originalImageUrl={currentImages?.original ?? null}
        translatedImageUrl={currentImages?.translated ?? null}
        presentationImages={imageUrls}
        initialComments={commentsByStepId[currentStep.id] ?? []}
        authorEmails={authorEmails}
      />
    </div>
  );
}
