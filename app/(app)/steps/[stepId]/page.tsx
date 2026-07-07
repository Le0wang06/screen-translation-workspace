import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { DeleteStepButton } from "@/components/steps/delete-step-button";
import { FlowUploadProvider } from "@/components/steps/flow-upload-provider";
import { RetryStepButton } from "@/components/steps/retry-step-button";
import { StepEditableHeader } from "@/components/steps/step-editable-header";
import { StepNavigation } from "@/components/steps/step-navigation";
import { StepRealtimeListener } from "@/components/steps/step-realtime-listener";
import { StepStatusBadge } from "@/components/steps/step-status-badge";
import { StepView } from "@/components/steps/step-view";
import { createClient } from "@/lib/supabase/server";
import { getScreenshotSignedUrl } from "@/lib/storage/signed-url";
import { stepPreviewImagePath } from "@/lib/steps/display-image";

type StepPageProps = {
  params: Promise<{ stepId: string }>;
};

export default async function StepPage({ params }: StepPageProps) {
  const { stepId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: step, error } = await supabase
    .from("steps")
    .select(
      "*, flows(id, name, project_id), projects!inner(id, name, owner_id)",
    )
    .eq("id", stepId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!step) {
    notFound();
  }

  const flow = step.flows;
  const project = step.projects;

  const originalImageUrl = await getScreenshotSignedUrl(supabase, step.image_url);
  const translatedImageUrl = step.translated_image_url
    ? await getScreenshotSignedUrl(supabase, step.translated_image_url)
    : null;

  const { data: flowSteps, error: flowStepsError } = await supabase
    .from("steps")
    .select("*")
    .eq("flow_id", flow.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (flowStepsError) {
    throw new Error(flowStepsError.message);
  }

  const stepThumbnailUrls = Object.fromEntries(
    await Promise.all(
      (flowSteps ?? []).map(async (flowStep) => [
        flowStep.id,
        await getScreenshotSignedUrl(
          supabase,
          stepPreviewImagePath(flowStep),
        ),
      ]),
    ),
  );

  const presentationImages = Object.fromEntries(
    await Promise.all(
      (flowSteps ?? []).map(async (flowStep) => {
        const original = flowStep.image_url
          ? await getScreenshotSignedUrl(supabase, flowStep.image_url)
          : null;
        const translated = flowStep.translated_image_url
          ? await getScreenshotSignedUrl(supabase, flowStep.translated_image_url)
          : null;

        return [flowStep.id, { original, translated }];
      }),
    ),
  );

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("*")
    .eq("step_id", stepId)
    .order("created_at", { ascending: true });

  if (commentsError) {
    throw new Error(commentsError.message);
  }

  const authorEmails = Object.fromEntries(
    (comments ?? []).map((comment) => [
      comment.author_id,
      comment.author_id === user?.id ? user.email ?? "You" : "Teammate",
    ]),
  );

  return (
    <FlowUploadProvider flowId={flow.id}>
      <StepRealtimeListener flowId={flow.id}>
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-4">
            <PageBreadcrumb
              items={[
                { label: "Dashboard", href: "/dashboard" },
                { label: project.name, href: `/projects/${project.id}` },
                { label: flow.name, href: `/flows/${flow.id}` },
                { label: step.title || "Screen" },
              ]}
            />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <StepEditableHeader
                stepId={stepId}
                title={step.title}
                summary={step.summary}
              />
              <div className="flex flex-wrap items-center gap-2">
                <StepStatusBadge status={step.status} />
                <DeleteStepButton
                  stepId={stepId}
                  flowId={flow.id}
                  stepTitle={step.title}
                />
              </div>
            </div>
            {step.status === "failed" && step.error_message ? (
              <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{step.error_message}</p>
                <RetryStepButton stepId={stepId} />
              </div>
            ) : null}
          </section>

          <StepNavigation
            steps={flowSteps ?? []}
            currentStepId={stepId}
            flowId={flow.id}
            thumbnailUrls={stepThumbnailUrls}
          />

          <StepView
            stepId={stepId}
            step={{
              title: step.title,
              summary: step.summary,
              status: step.status,
              target_language: step.target_language,
              error_message: step.error_message,
            }}
            flowSteps={flowSteps ?? []}
            originalImageUrl={originalImageUrl}
            translatedImageUrl={translatedImageUrl}
            presentationImages={presentationImages}
            initialComments={comments ?? []}
            authorEmails={authorEmails}
          />
        </div>
      </StepRealtimeListener>
    </FlowUploadProvider>
  );
}
