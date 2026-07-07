import { Badge } from "@/components/ui/badge";
import type { StepStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<StepStatus, string> = {
  processing: "Processing",
  done: "Ready",
  failed: "Failed",
};

const STATUS_VARIANTS: Record<
  StepStatus,
  "secondary" | "outline" | "destructive"
> = {
  processing: "secondary",
  done: "outline",
  failed: "destructive",
};

type StepStatusBadgeProps = {
  status: StepStatus;
  className?: string;
};

export function StepStatusBadge({ status, className }: StepStatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANTS[status]} className={cn(className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
