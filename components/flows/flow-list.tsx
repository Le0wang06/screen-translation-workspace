import Link from "next/link";
import { ArrowRight, Layers3 } from "lucide-react";

import { CreateFlowDialog } from "@/components/flows/create-flow-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Flow } from "@/lib/db/types";

type FlowListProps = {
  projectId: string;
  flows: Flow[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function FlowList({ projectId, flows }: FlowListProps) {
  if (flows.length === 0) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
            <Layers3 className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">No flows yet</p>
            <p className="text-sm text-muted-foreground text-pretty">
              Create one to start your walkthrough.
            </p>
          </div>
          <CreateFlowDialog
            projectId={projectId}
            triggerLabel="New flow"
            triggerSize="default"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 bg-muted/20">
        <div className="space-y-1">
          <CardTitle className="text-base">Flows</CardTitle>
          <CardDescription>
            {flows.length} flow{flows.length === 1 ? "" : "s"}
          </CardDescription>
        </div>
        <CreateFlowDialog projectId={projectId} />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {flows.map((flow) => (
            <li key={flow.id}>
              <Link
                href={`/flows/${flow.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-6"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{flow.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Created {formatDate(flow.created_at)}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
