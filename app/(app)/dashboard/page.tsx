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
            Projects
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground text-pretty">
            Each project groups flows and screenshot steps for one product or
            locale.
          </p>
        </div>
        <CreateProjectDialog />
      </section>

      <ProjectList projects={projects ?? []} />
    </div>
  );
}
