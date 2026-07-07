import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageBreadcrumbProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function PageBreadcrumb({ items, className }: PageBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-sm", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? (
              <ChevronRight
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
            ) : null}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  isLast ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
