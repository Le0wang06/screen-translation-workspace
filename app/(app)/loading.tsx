import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="rounded-xl border border-border/70 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36 w-36 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
