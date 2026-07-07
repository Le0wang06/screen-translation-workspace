import { AppHeader } from "@/components/app-header";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-canvas relative flex min-h-svh flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.94_0.02_255/0.45),transparent)]"
      />
      <AppHeader />
      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
