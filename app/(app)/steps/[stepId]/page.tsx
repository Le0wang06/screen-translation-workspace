import { notFound } from "next/navigation";

import { FlowUploadProvider } from "@/components/steps/flow-upload-provider";
import { FlowStepWorkspace } from "@/components/steps/flow-step-workspace";
import { StepRealtimeListener } from "@/components/steps/step-realtime-listener";
import { createClient } from "@/lib/supabase/server";
import { getScreenshotSignedUrls } from "@/lib/storage/signed-url";
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

  const { data: flowSteps, error: flowStepsError } = await supabase
    .from("steps")
    .select("*")
    .eq("flow_id", flow.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (flowStepsError) {
    throw new Error(flowStepsError.message);
  }

  const steps = flowSteps ?? [];
  const thumbnailPaths = steps.map((flowStep) => stepPreviewImagePath(flowStep));
  const fullImagePaths = steps.flatMap((flowStep) => [
    flowStep.image_url,
    flowStep.translated_image_url,
  ]);
  const signedImageUrls = await getScreenshotSignedUrls(
    supabase,
    [...fullImagePaths, ...thumbnailPaths],
  );

  const stepThumbnailUrls = Object.fromEntries(
    steps.map((flowStep) => {
      const path = stepPreviewImagePath(flowStep);
      return [flowStep.id, signedImageUrls[path] ?? null];
    }),
  );
  const stepImageUrls = Object.fromEntries(
    steps.map((flowStep) => [
      flowStep.id,
      {
        original: signedImageUrls[flowStep.image_url] ?? null,
        translated: flowStep.translated_image_url
          ? signedImageUrls[flowStep.translated_image_url] ?? null
          : null,
      },
    ]),
  );

  return (
    <FlowUploadProvider flowId={flow.id}>
      <StepRealtimeListener flowId={flow.id}>
        <FlowStepWorkspace
          initialStepId={stepId}
          project={project}
          flow={flow}
          steps={steps}
          thumbnailUrls={stepThumbnailUrls}
          imageUrls={stepImageUrls}
        />
      </StepRealtimeListener>
    </FlowUploadProvider>
  );
}
