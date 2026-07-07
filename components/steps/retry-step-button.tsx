"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

type RetryStepButtonProps = {
  stepId: string;
};

export function RetryStepButton({ stepId }: RetryStepButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/steps/${stepId}/retry`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not retry this step.");
        return;
      }

      router.refresh();
    } catch {
      setError("Could not retry this step.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        disabled={pending}
        onClick={() => void handleRetry()}
      >
        <RotateCcw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        {pending ? "Retrying…" : "Try again"}
      </Button>
      {error ? <FieldError errors={[{ message: error }]} /> : null}
    </div>
  );
}
