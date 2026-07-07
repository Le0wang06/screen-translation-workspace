import { NextResponse } from "next/server";

import { getOwnedFlow } from "@/lib/api/flows";
import {
  badRequest,
  notFound,
  requireUser,
  serverError,
} from "@/lib/api/helpers";
import { markStepFailed, processStep } from "@/lib/process-step";
import {
  extensionFromMime,
  screenshotStoragePath,
  SCREENSHOTS_BUCKET,
} from "@/lib/storage/screenshots";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function GET(_request: Request, context: RouteContext) {
  const { id: flowId } = await context.params;
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { flow, error: flowError } = await getOwnedFlow(
    supabase,
    flowId,
    user.id,
  );

  if (flowError) {
    return serverError(flowError.message);
  }

  if (!flow) {
    return notFound("Flow not found.");
  }

  const { data, error } = await supabase
    .from("steps")
    .select("*")
    .eq("flow_id", flowId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({ steps: data });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: flowId } = await context.params;
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { flow, error: flowError } = await getOwnedFlow(
    supabase,
    flowId,
    user.id,
  );

  if (flowError) {
    return serverError(flowError.message);
  }

  if (!flow) {
    return notFound("Flow not found.");
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return badRequest("Screenshot file is required.");
  }

  if (!file.type.startsWith("image/")) {
    return badRequest("Only image uploads are supported.");
  }

  if (file.size > MAX_FILE_SIZE) {
    return badRequest("Screenshot must be 10 MB or smaller.");
  }

  const project = flow.projects;

  const { data: existingSteps, error: positionError } = await supabase
    .from("steps")
    .select("position")
    .eq("flow_id", flowId)
    .order("position", { ascending: false })
    .limit(1);

  if (positionError) {
    return serverError(positionError.message);
  }

  const nextPosition = (existingSteps?.[0]?.position ?? -1) + 1;
  const extension = extensionFromMime(file.type);

  const { data: step, error: stepError } = await supabase
    .from("steps")
    .insert({
      flow_id: flowId,
      project_id: project.id,
      status: "processing",
      image_url: "",
      position: nextPosition,
      source_language: project.source_language,
      target_language: project.target_language,
    })
    .select("*")
    .single();

  if (stepError || !step) {
    return serverError(stepError?.message ?? "Failed to create step.");
  }

  const storagePath = screenshotStoragePath(
    project.id,
    flowId,
    step.id,
    extension,
  );

  const fileBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    await markStepFailed(supabase, step.id, uploadError.message);
    return serverError(uploadError.message);
  }

  const { error: imageUpdateError } = await supabase
    .from("steps")
    .update({ image_url: storagePath })
    .eq("id", step.id);

  if (imageUpdateError) {
    await markStepFailed(supabase, step.id, imageUpdateError.message);
    return serverError(imageUpdateError.message);
  }

  try {
    await processStep(supabase, {
      stepId: step.id,
      imagePath: storagePath,
      sourceLanguage: project.source_language,
      targetLanguage: project.target_language,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process screenshot.";
    await markStepFailed(supabase, step.id, message);
    return serverError(message);
  }

  const { data: completedStep, error: fetchError } = await supabase
    .from("steps")
    .select("*")
    .eq("id", step.id)
    .single();

  if (fetchError || !completedStep) {
    return serverError(fetchError?.message ?? "Failed to load step.");
  }

  return NextResponse.json({ step: completedStep }, { status: 201 });
}
