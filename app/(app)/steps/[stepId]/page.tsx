import Image from "next/image";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { StepStatusBadge } from "@/components/steps/step-status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getScreenshotSignedUrl } from "@/lib/storage/signed-url";

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

  const { data: blocks, error: blocksError } = await supabase
    .from("step_blocks")
    .select("*")
    .eq("step_id", stepId)
    .order("position", { ascending: true });

  if (blocksError) {
    throw new Error(blocksError.message);
  }

  const imageUrl = await getScreenshotSignedUrl(supabase, step.image_url);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageBreadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: project.name, href: `/projects/${project.id}` },
            { label: flow.name, href: `/flows/${flow.id}` },
            { label: step.title || "Step" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {step.title || "Untitled step"}
          </h1>
          <StepStatusBadge status={step.status} />
        </div>
        {step.summary ? (
          <p className="max-w-3xl text-muted-foreground text-pretty">
            {step.summary}
          </p>
        ) : null}
        {step.status === "failed" && step.error_message ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {step.error_message}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle className="text-base">Screenshot</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {imageUrl ? (
              <div className="relative aspect-[4/3] w-full bg-muted/20">
                <Image
                  src={imageUrl}
                  alt={step.title || "Screenshot"}
                  fill
                  className="object-contain"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  unoptimized
                  priority
                />
              </div>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted-foreground">
                {step.status === "processing"
                  ? "Processing screenshot…"
                  : "Screenshot unavailable"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle className="text-base">Translations</CardTitle>
            <CardDescription>
              {step.status === "processing"
                ? "AI is reading the screenshot and extracting UI text."
                : `${blocks?.length ?? 0} text block${blocks?.length === 1 ? "" : "s"}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {step.status === "processing" ? (
              <div className="px-4 py-10 text-sm text-muted-foreground sm:px-6">
                Translation in progress…
              </div>
            ) : blocks && blocks.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {blocks.map((block) => (
                  <li
                    key={block.id}
                    className="grid gap-2 px-4 py-4 sm:grid-cols-2 sm:px-6"
                  >
                    <p className="text-sm text-muted-foreground">
                      {block.source_text}
                    </p>
                    <p className="text-sm font-medium">{block.translated_text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-10 text-sm text-muted-foreground sm:px-6">
                No translated text blocks yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
