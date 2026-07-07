"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Send } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { Comment } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type StepCommentsProps = {
  stepId: string;
  initialComments: Comment[];
  authorEmails: Record<string, string>;
};

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export function StepComments({
  stepId,
  initialComments,
  authorEmails,
}: StepCommentsProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`step-comments:${stepId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `step_id=eq.${stepId}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, stepId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/steps/${stepId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Failed to post comment.");
        return;
      }

      setBody("");
      router.refresh();
    } catch {
      setError("Failed to post comment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <CardTitle className="text-base">Comments</CardTitle>
        <CardDescription>
          {initialComments.length === 0
            ? "Leave feedback for your team on this screen."
            : `${initialComments.length} comment${initialComments.length === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        {initialComments.length > 0 ? (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {initialComments.map((comment) => (
              <li key={comment.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {authorEmails[comment.author_id] ?? "Teammate"}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={comment.created_at}>
                    {formatRelativeTime(comment.created_at)}
                  </time>
                </div>
                <p className="text-sm text-pretty">{comment.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No comments yet. Add one below.
          </p>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a comment…"
            rows={3}
            disabled={pending}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <div className="flex items-center justify-between gap-3">
            {error ? <FieldError errors={[{ message: error }]} /> : <span />}
            <Button type="submit" size="sm" className="gap-1.5" disabled={pending || !body.trim()}>
              <Send className="size-4" aria-hidden />
              {pending ? "Posting…" : "Post comment"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
