"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

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
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [flowId, router]);

  return children;
}
