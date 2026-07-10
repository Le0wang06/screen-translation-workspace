"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil } from "lucide-react";

import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type StepEditableHeaderProps = {
  stepId: string;
  title: string | null;
  summary: string | null;
};

export function StepEditableHeader({
  stepId,
  title,
  summary,
}: StepEditableHeaderProps) {
  const router = useRouter();
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [summaryValue, setSummaryValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function startEditingTitle() {
    setTitleValue(title ?? "");
    setEditingTitle(true);
  }

  function startEditingSummary() {
    setSummaryValue(summary ?? "");
    setEditingSummary(true);
  }

  async function saveField(field: "title" | "summary", value: string) {
    const trimmed = value.trim();
    const current = field === "title" ? title ?? "" : summary ?? "";

    if (field === "title" && !trimmed) {
      setError("标题不能为空。");
      setTitleValue(title ?? "");
      return;
    }

    if (trimmed === current) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/steps/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: trimmed }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "保存失败。");
        if (field === "title") setTitleValue(title ?? "");
        if (field === "summary") setSummaryValue(summary ?? "");
        return;
      }

      router.refresh();
    } catch {
      setError("保存失败。");
      if (field === "title") setTitleValue(title ?? "");
      if (field === "summary") setSummaryValue(summary ?? "");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative max-w-3xl">
        {editingTitle ? (
          <Input
            autoFocus
            value={titleValue}
            disabled={pending}
            className="text-3xl font-semibold tracking-tight h-auto py-1"
            onChange={(event) => setTitleValue(event.target.value)}
            onBlur={() => {
              setEditingTitle(false);
              void saveField("title", titleValue);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
              }
              if (event.key === "Escape") {
                setTitleValue(title ?? "");
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-start gap-2 text-left text-3xl font-semibold tracking-tight text-balance",
              "rounded-md transition-colors hover:bg-muted/40 -mx-2 px-2 py-1",
            )}
            onClick={startEditingTitle}
          >
            <span>{title || "未命名屏幕"}</span>
            <Pencil className="mt-2 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </button>
        )}
      </div>

      <div className="group relative max-w-3xl">
        {editingSummary ? (
          <textarea
            autoFocus
            value={summaryValue}
            disabled={pending}
            rows={3}
            className={cn(
              "w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
            placeholder="补充这张屏幕的简短说明…"
            onChange={(event) => setSummaryValue(event.target.value)}
            onBlur={() => {
              setEditingSummary(false);
              void saveField("summary", summaryValue);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSummaryValue(summary ?? "");
                setEditingSummary(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-start gap-2 text-left text-muted-foreground text-pretty",
              "rounded-md transition-colors hover:bg-muted/40 -mx-2 px-2 py-1",
              !summary && "italic",
            )}
            onClick={startEditingSummary}
          >
            <span>{summary || "添加说明…"}</span>
            <Pencil className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </button>
        )}
      </div>

      {error ? <FieldError errors={[{ message: error }]} /> : null}
    </div>
  );
}
