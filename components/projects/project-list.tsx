import Link from "next/link";
import { ArrowRight, FolderKanban } from "lucide-react";

import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Project } from "@/lib/db/types";

type ProjectListProps = {
  projects: Project[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
            <FolderKanban className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground text-pretty">
              Create one to get started with your first translation walkthrough.
            </p>
          </div>
          <CreateProjectDialog
            triggerLabel="Create project"
            triggerSize="default"
            triggerIcon={<ArrowRight className="size-4" aria-hidden />}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 bg-muted/20">
        <div className="space-y-1">
          <CardTitle className="text-base">Projects</CardTitle>
          <CardDescription>
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </CardDescription>
        </div>
        <CreateProjectDialog />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-6"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{project.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Created {formatDate(project.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">→ {project.target_language}</Badge>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
