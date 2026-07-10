import { notFound } from "next/navigation";

import { StepList } from "@/components/steps/step-list";
import { FlowUploadProvider } from "@/components/steps/flow-upload-provider";
import { StepRealtimeListener } from "@/components/steps/step-realtime-listener";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { getScreenshotSignedUrls } from "@/lib/storage/signed-url";
import { stepPreviewImagePath } from "@/lib/steps/display-image";

type FlowPageProps = {
  params: Promise<{ flowId: string }>;
};

export default async function FlowPage({ params }: FlowPageProps) {
  const { flowId } = await params;
  const supabase = await createClient();

  const { data: flow, error } = await supabase
    .from("flows")
    .select("*, projects(id, name, target_language)")
    .eq("id", flowId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!flow) {
    notFound();
  }

  const project = flow.projects;

  const { data: steps, error: stepsError } = await supabase
    .from("steps")
    .select("*")
    .eq("flow_id", flowId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (stepsError) {
    throw new Error(stepsError.message);
  }

  const thumbnailPaths = (steps ?? []).map((step) => stepPreviewImagePath(step));
  const signedThumbnailUrls = await getScreenshotSignedUrls(
    supabase,
    thumbnailPaths,
  );
  const thumbnailUrls = Object.fromEntries(
    (steps ?? []).map((step) => {
      const path = stepPreviewImagePath(step);
      return [step.id, signedThumbnailUrls[path] ?? null];
    }),
  );

  return (
    <FlowUploadProvider flowId={flowId}>
      <StepRealtimeListener flowId={flowId}>
        <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <PageBreadcrumb
            items={[
              { label: "Dashboard", href: "/dashboard" },
              { label: project.name, href: `/projects/${project.id}` },
              { label: flow.name },
            ]}
          />
          <div className="max-w-2xl space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{flow.name}</h1>
            <p className="text-muted-foreground text-pretty">
              Upload screenshots to generate localized versions of each screen.
            </p>
          </div>
        </section>

        <StepList
          flowId={flowId}
          steps={steps ?? []}
          thumbnailUrls={thumbnailUrls}
        />
        </div>
      </StepRealtimeListener>
    </FlowUploadProvider>
  );
}
