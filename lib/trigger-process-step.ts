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
  // Text-overlay localization requires sharp + canvas and runs in Next.js only.
  after(async () => {
    await runProcessStepInBackground(input);
  });
}
