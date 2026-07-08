import { after } from "next/server";

import type { requireUser } from "@/lib/api/helpers";
import { markStepFailed, processStep } from "@/lib/process-step";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

export type TriggerProcessStepInput = {
  stepId: string;
  imagePath: string;
  sourceLanguage?: string | null;
  targetLanguage: string;
  notes?: string | null;
};

async function runProcessStepInBackground(input: TriggerProcessStepInput) {
  const supabase = await createClient();
  try {
    await processStep(supabase, input);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process screenshot.";
    await markStepFailed(supabase, input.stepId, message);
  }
}

export async function triggerProcessStep(
  supabase: SupabaseClient,
  input: TriggerProcessStepInput,
) {
  const useEdgeFunction = process.env.PROCESS_USE_EDGE_FUNCTION === "true";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (useEdgeFunction && supabaseUrl && serviceRoleKey) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/process-step`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Fall back to in-process background work below.
    }
  }

  after(async () => {
    await runProcessStepInBackground(input);
  });
}
