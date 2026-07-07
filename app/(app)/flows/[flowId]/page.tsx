import { notFound } from "next/navigation";
import { Upload } from "lucide-react";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <PageBreadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: project.name, href: `/projects/${project.id}` },
            { label: flow.name },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{flow.name}</h1>
          <Badge variant="outline">Day 2</Badge>
        </div>
        <p className="max-w-2xl text-muted-foreground text-pretty">
          Screenshot upload and AI translation land here next.
        </p>
      </section>

      <Card className="border-border/70 border-dashed shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Steps</CardTitle>
          <CardDescription>
            Upload screenshots here on Day 2 to build your walkthrough.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
            <Upload className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">No steps yet</p>
            <p className="text-sm text-muted-foreground text-pretty">
              This flow is ready. Step upload and translation are coming in the
              next build session.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
