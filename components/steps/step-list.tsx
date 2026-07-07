import { DropZoneCard } from "@/components/steps/drop-zone-card";
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
  flowId: string;
  steps: Step[];
  thumbnailUrls: Record<string, string | null>;
};

export function StepList({ flowId, steps, thumbnailUrls }: StepListProps) {
  if (steps.length === 0) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
          <DropZoneCard />
          <div className="flex justify-center">
            <UploadStepButton />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 bg-muted/20">
        <div className="space-y-1">
          <CardTitle className="text-base">Screens</CardTitle>
          <CardDescription>
            {steps.length} screen{steps.length === 1 ? "" : "s"} — scroll sideways
            to browse, click to open
          </CardDescription>
        </div>
        <UploadStepButton />
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        <StepFilmstrip steps={steps} thumbnailUrls={thumbnailUrls} flowId={flowId} />
        <DropZoneCard compact />
      </CardContent>
    </Card>
  );
}
