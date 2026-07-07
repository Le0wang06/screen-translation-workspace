"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";

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

type RegenerateStepButtonProps = {
  stepId: string;
  disabled?: boolean;
};

export function RegenerateStepButton({
  stepId,
  disabled,
}: RegenerateStepButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/steps/${stepId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not regenerate this screen.");
        return;
      }

      setOpen(false);
      setNotes("");
      router.refresh();
    } catch {
      setError("Could not regenerate this screen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={disabled}
          />
        }
      >
        <Sparkles className="size-4" aria-hidden />
        Re-generate
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Re-generate translated screen</DialogTitle>
          <DialogDescription>
            AI will recreate the localized screenshot from the original. Add
            optional notes to guide the translation.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={notes}
          disabled={pending}
          rows={4}
          placeholder='e.g. Use "Checkout" instead of "Cart" on the main button'
          className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => setNotes(event.target.value)}
        />
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
            disabled={pending}
            onClick={() => void handleRegenerate()}
          >
            {pending ? "Starting…" : "Re-generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
