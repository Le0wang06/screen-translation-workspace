import { notFound } from "next/navigation";

import { FlowList } from "@/components/flows/flow-list";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(projectError.message);
  }

  if (!project) {
    notFound();
  }

  const { data: flows, error: flowsError } = await supabase
    .from("flows")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (flowsError) {
    throw new Error(flowsError.message);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageBreadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: project.name },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          <Badge variant="outline">Target: {project.target_language}</Badge>
          {project.source_language ? (
            <Badge variant="secondary">Source: {project.source_language}</Badge>
          ) : null}
        </div>
        <p className="max-w-2xl text-muted-foreground text-pretty">
          Flows are ordered walkthroughs inside this project. Create one, then
          upload screenshots as steps on Day 2.
        </p>
      </section>

      <FlowList projectId={project.id} flows={flows ?? []} />
    </div>
  );
}
