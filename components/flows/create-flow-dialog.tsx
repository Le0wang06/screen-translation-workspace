"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type CreateFlowDialogProps = {
  projectId: string;
  trigger?: React.ReactElement;
};

export function CreateFlowDialog({ projectId, trigger }: CreateFlowDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function resetForm() {
    setName("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const payload = (await response.json()) as {
        error?: string;
        flow?: { id: string };
      };

      if (!response.ok) {
        setError(payload.error ?? "Failed to create flow.");
        return;
      }

      setOpen(false);
      resetForm();
      router.refresh();

      if (payload.flow?.id) {
        router.push(`/flows/${payload.flow.id}`);
      }
    } catch {
      setError("Failed to create flow.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger
        render={trigger ?? <Button size="sm">New flow</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create flow</DialogTitle>
          <DialogDescription>
            A flow is an ordered walkthrough, like a checkout or onboarding path.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="flow-name">Name</FieldLabel>
              <Input
                id="flow-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Checkout walkthrough"
                required
              />
            </Field>
          </FieldGroup>
          {error ? <FieldError errors={[{ message: error }]} /> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create flow"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
