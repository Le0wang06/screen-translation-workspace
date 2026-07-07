"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";

type DeleteStepButtonProps = {
  stepId: string;
  flowId: string;
  stepTitle?: string | null;
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "icon-sm";
};

export function DeleteStepButton({
  stepId,
  flowId,
  stepTitle,
  variant = "outline",
  size = "sm",
}: DeleteStepButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/steps/${stepId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        error?: string;
        flowId?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Could not delete this screen.");
        return;
      }

      setOpen(false);
      router.push(`/flows/${payload.flowId ?? flowId}`);
      router.refresh();
    } catch {
      setError("Could not delete this screen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant={variant} size={size} className="gap-1.5" />
        }
      >
        <Trash2 className="size-4" aria-hidden />
        Delete
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Delete screen?</DialogTitle>
          <DialogDescription>
            {stepTitle
              ? `"${stepTitle}" and its screenshots will be permanently removed.`
              : "This screen and its screenshots will be permanently removed."}
          </DialogDescription>
        </DialogHeader>
        {error ? <FieldError errors={[{ message: error }]} /> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void handleDelete()}
          >
            {pending ? "Deleting…" : "Delete screen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
