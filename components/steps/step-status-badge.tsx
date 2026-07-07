import { Loader2 } from "lucide-react";

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
    <Badge
      variant={STATUS_VARIANTS[status]}
      className={cn(
        "gap-1.5",
        status === "processing" && "border-primary/20 bg-primary/10 text-primary",
        className,
      )}
    >
      {status === "processing" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full",
            status === "done" && "bg-emerald-500",
            status === "failed" && "bg-destructive",
          )}
          aria-hidden
        />
      )}
      {STATUS_LABELS[status]}
    </Badge>
  );
}
