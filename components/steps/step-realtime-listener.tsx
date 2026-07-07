"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";
import { debounce } from "@/lib/debounce";

type StepRealtimeListenerProps = {
  flowId: string;
  children: React.ReactNode;
};

export function StepRealtimeListener({
  flowId,
  children,
}: StepRealtimeListenerProps) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = debounce(() => {
      router.refresh();
    }, 350);

    const channel = supabase
      .channel(`flow-steps:${flowId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "steps",
          filter: `flow_id=eq.${flowId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      refresh.cancel();
      void supabase.removeChannel(channel);
    };
  }, [flowId, router]);

  return children;
}
