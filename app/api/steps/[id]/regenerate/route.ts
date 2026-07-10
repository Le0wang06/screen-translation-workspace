import { NextResponse } from "next/server";

import { getOwnedStep } from "@/lib/api/flows";
import {
  badRequest,
  notFound,
  requireUser,
  serverError,
} from "@/lib/api/helpers";
import { triggerProcessStep } from "@/lib/trigger-process-step";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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
    return notFound("屏幕不存在。");
  }

  if (step.status === "processing") {
    return badRequest("此屏幕正在处理中。");
  }

  if (!step.image_url) {
    return badRequest("此屏幕没有可处理的截图。");
  }

  const body = (await request.json().catch(() => ({}))) as {
    notes?: string;
  };
  const notes = body.notes?.trim() || null;

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

  await triggerProcessStep(supabase, {
    stepId,
    imagePath: step.image_url,
    sourceLanguage: project.source_language ?? step.source_language,
    targetLanguage: project.target_language ?? step.target_language,
    notes,
  });

  const { data: updatedStep, error: fetchError } = await supabase
    .from("steps")
    .select("*")
    .eq("id", stepId)
    .single();

  if (fetchError || !updatedStep) {
    return serverError(fetchError?.message ?? "加载屏幕失败。");
  }

  return NextResponse.json({ step: updatedStep });
}
