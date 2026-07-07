import { Upload } from "lucide-react";

import { StepFilmstrip } from "@/components/steps/step-filmstrip";
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
              Upload your first screenshot to generate a localized screen.
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
            {steps.length} step{steps.length === 1 ? "" : "s"} — scroll sideways
            to browse, click to open
          </CardDescription>
        </div>
        <UploadStepButton />
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <StepFilmstrip steps={steps} thumbnailUrls={thumbnailUrls} />
      </CardContent>
    </Card>
  );
}
