import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground text-pretty">
          This project, flow, or screen doesn&apos;t exist or you don&apos;t have
          access to it.
        </p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "default" }))}>
        Back to dashboard
      </Link>
    </div>
  );
}
