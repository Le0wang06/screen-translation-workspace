import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectList } from "@/components/projects/project-list";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            项目
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground text-pretty">
            每个项目用于管理一个产品或语言版本的流程和截图。
          </p>
        </div>
        <CreateProjectDialog />
      </section>

      <ProjectList projects={projects ?? []} />
    </div>
  );
}
