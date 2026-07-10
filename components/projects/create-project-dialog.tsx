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
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";

type CreateProjectDialogProps = {
  triggerLabel?: string;
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerSize?: VariantProps<typeof buttonVariants>["size"];
  triggerClassName?: string;
  triggerIcon?: React.ReactNode;
};

export function CreateProjectDialog({
  triggerLabel = "新建项目",
  triggerVariant = "default",
  triggerSize = "sm",
  triggerClassName,
  triggerIcon,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState(DEFAULT_TARGET_LANGUAGE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function resetForm() {
    setName("");
    setSourceLanguage("");
    setTargetLanguage(DEFAULT_TARGET_LANGUAGE);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          source_language: sourceLanguage || undefined,
          target_language: targetLanguage,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        project?: { id: string };
      };

      if (!response.ok) {
        setError(payload.error ?? "创建项目失败。");
        return;
      }

      setOpen(false);
      resetForm();
      router.refresh();

      if (payload.project?.id) {
        router.push(`/projects/${payload.project.id}`);
      }
    } catch {
      setError("创建项目失败。");
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
          triggerIcon && "gap-2",
          triggerClassName,
        )}
      >
        {triggerLabel}
        {triggerIcon}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建项目</DialogTitle>
          <DialogDescription>
            用一个项目管理同一产品或语言版本的流程和截图。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-name">名称</FieldLabel>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="供应商应用"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="source-language">
                源语言 <span className="text-muted-foreground">（可选）</span>
              </FieldLabel>
              <Input
                id="source-language"
                value={sourceLanguage}
                onChange={(event) => setSourceLanguage(event.target.value)}
                placeholder="en"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="target-language">目标语言</FieldLabel>
              <select
                id="target-language"
                value={targetLanguage}
                onChange={(event) => setTargetLanguage(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {TARGET_LANGUAGES.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
            </Field>
          </FieldGroup>
          {error ? <FieldError errors={[{ message: error }]} /> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "创建中…" : "创建项目"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
