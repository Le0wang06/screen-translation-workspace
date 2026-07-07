import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";

import { StepStatusBadge } from "@/components/steps/step-status-badge";
import { UploadStepButton } from "@/components/steps/upload-step-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Step } from "@/lib/db/types";

type StepListProps = {
  steps: Step[];
  thumbnailUrls: Record<string, string | null>;
};

export function StepList({ steps, thumbnailUrls }: StepListProps) {
  if (steps.length === 0) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
            <Upload className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">No steps yet</p>
            <p className="text-sm text-muted-foreground text-pretty">
              Upload your first screenshot to translate visible UI text.
            </p>
          </div>
          <UploadStepButton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 bg-muted/20">
        <div className="space-y-1">
          <CardTitle className="text-base">Steps</CardTitle>
          <CardDescription>
            {steps.length} step{steps.length === 1 ? "" : "s"} in this flow
          </CardDescription>
        </div>
        <UploadStepButton />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {steps.map((step) => {
            const thumbnailUrl = thumbnailUrls[step.id];

            return (
              <li key={step.id}>
                <Link
                  href={`/steps/${step.id}`}
                  className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-6"
                >
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted/30">
                    {thumbnailUrl ? (
                      <Image
                        src={thumbnailUrl}
                        alt=""
                        fill
                        className="object-cover object-top"
                        sizes="56px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                        —
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">
                      {step.title || "Untitled step"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {step.summary || "Screenshot step"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StepStatusBadge status={step.status} />
                    <ArrowRight
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
