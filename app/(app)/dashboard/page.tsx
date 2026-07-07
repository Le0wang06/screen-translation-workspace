import { ArrowRight, FolderKanban, Layers3, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const roadmap = [
  {
    icon: FolderKanban,
    title: "Projects",
    description: "Group flows by product or locale.",
  },
  {
    icon: Layers3,
    title: "Flows",
    description: "Ordered walkthroughs your team can follow.",
  },
  {
    icon: Upload,
    title: "Steps",
    description: "Screenshots translated into editable blocks.",
  },
] as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">Dashboard</Badge>
          {user?.email ? (
            <Badge variant="outline">{user.email}</Badge>
          ) : null}
        </div>
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Your translation projects
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
            Create a project, add flows, and upload screenshots as ordered
            steps. Project creation lands in the next Day 1 step.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle className="text-base">Projects</CardTitle>
            <CardDescription>
              Flows and screenshots will be organized under each project.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-14 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
              <FolderKanban
                className="size-6 text-muted-foreground"
                aria-hidden
              />
            </div>
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground text-pretty">
                You&apos;re signed in. Project and flow creation is up next.
              </p>
            </div>
            <Button disabled className="gap-2">
              Create project
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {roadmap.map(({ icon: Icon, title, description }) => (
            <Card key={title} size="sm" className="border-border/70 shadow-sm">
              <CardHeader className="flex-row items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4 text-foreground" aria-hidden />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-sm">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
