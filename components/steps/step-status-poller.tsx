"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { StepStatus } from "@/lib/db/types";

type StepStatusPollerProps = {
  stepId: string;
  status: StepStatus;
  children: React.ReactNode;
};

export function StepStatusPoller({
  stepId,
  status,
  children,
}: StepStatusPollerProps) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "processing") return;

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/steps/${stepId}`);
        if (!response.ok) return;

        const payload = (await response.json()) as {
          step?: { status: StepStatus };
        };

        if (payload.step?.status && payload.step.status !== "processing") {
          router.refresh();
        }
      } catch {
        // Ignore transient polling errors.
      }
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [router, status, stepId]);

  return children;
}
