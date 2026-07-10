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
      error instanceof Error ? error.message : "处理截图失败。";
    console.error(
      `[process-step] step ${input.stepId} failed:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    await markStepFailed(supabase, input.stepId, message);
  }
}

export async function triggerProcessStep(
  supabase: SupabaseClient,
  input: TriggerProcessStepInput,
) {
  // Direct image localization runs in Next.js so it can use the OpenAI SDK.
  after(async () => {
    await runProcessStepInBackground(input);
  });
}
