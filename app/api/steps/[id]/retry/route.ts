import { NextResponse, after } from "next/server";

import { getOwnedStep } from "@/lib/api/flows";
import { notFound, requireUser, serverError } from "@/lib/api/helpers";
import { markStepFailed, processStep } from "@/lib/process-step";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id: stepId } = await context.params;
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { step, error: stepError } = await getOwnedStep(
    supabase,
    stepId,
    user.id,
  );

  if (stepError) {
    return serverError(stepError.message);
  }

  if (!step) {
    return notFound("Step not found.");
  }

  if (step.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed steps can be retried." },
      { status: 400 },
    );
  }

  if (!step.image_url) {
    return NextResponse.json(
      { error: "This step has no screenshot to process." },
      { status: 400 },
    );
  }

  const project = step.projects;

  const { error: resetError } = await supabase
    .from("steps")
    .update({
      status: "processing",
      error_message: null,
      translated_image_url: "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", stepId);

  if (resetError) {
    return serverError(resetError.message);
  }

  after(async () => {
    const backgroundSupabase = await createClient();
    try {
      await processStep(backgroundSupabase, {
        stepId,
        imagePath: step.image_url,
        sourceLanguage: project.source_language ?? step.source_language,
        targetLanguage: project.target_language ?? step.target_language,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to process screenshot.";
      await markStepFailed(backgroundSupabase, stepId, message);
    }
  });

  const { data: updatedStep, error: fetchError } = await supabase
    .from("steps")
    .select("*")
    .eq("id", stepId)
    .single();

  if (fetchError || !updatedStep) {
    return serverError(fetchError?.message ?? "Failed to load step.");
  }

  return NextResponse.json({ step: updatedStep });
}
