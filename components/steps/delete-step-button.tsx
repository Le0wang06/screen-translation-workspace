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
        setError(payload.error ?? "无法删除此屏幕。");
        return;
      }

      setOpen(false);
      router.push(`/flows/${payload.flowId ?? flowId}`);
      router.refresh();
    } catch {
      setError("无法删除此屏幕。");
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
        删除
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>删除屏幕？</DialogTitle>
          <DialogDescription>
            {stepTitle
              ? `“${stepTitle}”及其截图将被永久删除。`
              : "此屏幕及其截图将被永久删除。"}
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
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void handleDelete()}
          >
            {pending ? "删除中…" : "删除屏幕"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
