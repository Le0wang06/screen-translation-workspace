import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">页面不存在</h1>
        <p className="max-w-md text-sm text-muted-foreground text-pretty">
          这个项目、流程或屏幕不存在，或你没有访问权限。
        </p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "default" }))}>
        返回项目页
      </Link>
    </div>
  );
}
