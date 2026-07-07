import Image from "next/image";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { FlowUploadProvider } from "@/components/steps/flow-upload-provider";
import { ProcessingImagePlaceholder } from "@/components/steps/processing-image-placeholder";
import { RetryStepButton } from "@/components/steps/retry-step-button";
import { StepNavigation } from "@/components/steps/step-navigation";
import { StepStatusBadge } from "@/components/steps/step-status-badge";
import { StepStatusPoller } from "@/components/steps/step-status-poller";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getScreenshotSignedUrl } from "@/lib/storage/signed-url";
import { stepPreviewImagePath } from "@/lib/steps/display-image";

type StepPageProps = {
  params: Promise<{ stepId: string }>;
};

export default async function StepPage({ params }: StepPageProps) {
  const { stepId } = await params;
  const supabase = await createClient();

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

  return (
    <FlowUploadProvider flowId={flow.id}>
      <StepStatusPoller stepId={stepId} status={step.status}>
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
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-balance">
                {step.title || "Untitled screen"}
              </h1>
              <StepStatusBadge status={step.status} />
            </div>
            {step.summary ? (
              <p className="max-w-3xl text-muted-foreground text-pretty">
                {step.summary}
              </p>
            ) : null}
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
            thumbnailUrls={stepThumbnailUrls}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden border-border/70 shadow-sm">
              <CardHeader className="border-b border-border/60 bg-muted/20">
                <CardTitle className="text-base">Original</CardTitle>
                <CardDescription>Uploaded screenshot</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {originalImageUrl ? (
                  <div className="relative aspect-[4/3] w-full bg-muted/20">
                    <Image
                      src={originalImageUrl}
                      alt={step.title || "Original screenshot"}
                      fill
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      unoptimized
                      priority
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted-foreground">
                    Original unavailable
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/70 shadow-sm">
              <CardHeader className="border-b border-border/60 bg-muted/20">
                <CardTitle className="text-base">Translated</CardTitle>
                <CardDescription>
                  {step.status === "processing"
                    ? "AI is regenerating this screen in the target language."
                    : `UI recreated in ${step.target_language}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {step.status === "processing" ? (
                  <ProcessingImagePlaceholder />
                ) : translatedImageUrl ? (
                  <div className="relative aspect-[4/3] w-full bg-muted/20">
                    <Image
                      src={translatedImageUrl}
                      alt={step.title || "Translated screenshot"}
                      fill
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
                    <p>Translated screenshot not available yet.</p>
                    {step.status === "failed" ? (
                      <RetryStepButton stepId={stepId} />
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </StepStatusPoller>
    </FlowUploadProvider>
  );
}
