"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive">
        <AlertCircle className="size-6" aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold">页面出错了</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          当前页面无法加载。你可以重试，或回到项目页。
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className={cn(buttonVariants({ variant: "default" }))}
        >
          重试
        </button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          返回项目页
        </Link>
      </div>
    </div>
  );
}
