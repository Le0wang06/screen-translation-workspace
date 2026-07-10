"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type CreateFlowDialogProps = {
  projectId: string;
  triggerLabel?: string;
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerSize?: VariantProps<typeof buttonVariants>["size"];
  triggerClassName?: string;
};

export function CreateFlowDialog({
  projectId,
  triggerLabel = "新建流程",
  triggerVariant = "default",
  triggerSize = "sm",
  triggerClassName,
}: CreateFlowDialogProps) {
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
        setError(payload.error ?? "创建流程失败。");
        return;
      }

      setOpen(false);
      resetForm();
      router.refresh();

      if (payload.flow?.id) {
        router.push(`/flows/${payload.flow.id}`);
      }
    } catch {
      setError("创建流程失败。");
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
        className={cn(
          buttonVariants({ variant: triggerVariant, size: triggerSize }),
          triggerClassName,
        )}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建流程</DialogTitle>
          <DialogDescription>
            流程是一组有顺序的屏幕，例如结账路径或新手引导。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="flow-name">名称</FieldLabel>
              <Input
                id="flow-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="结账流程"
                required
              />
            </Field>
          </FieldGroup>
          {error ? <FieldError errors={[{ message: error }]} /> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "创建中…" : "创建流程"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
