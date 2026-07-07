import { NextResponse } from "next/server";

import { getOwnedStep } from "@/lib/api/flows";
import {
  badRequest,
  notFound,
  requireUser,
  serverError,
} from "@/lib/api/helpers";
import { getScreenshotSignedUrl } from "@/lib/storage/signed-url";
import {
  SCREENSHOTS_BUCKET,
} from "@/lib/storage/screenshots";
import { stepPreviewImagePath } from "@/lib/steps/display-image";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
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

  const imageUrl = await getScreenshotSignedUrl(supabase, step.image_url);
  const localizedImageUrl = step.translated_image_url
    ? await getScreenshotSignedUrl(supabase, step.translated_image_url)
    : null;
  const previewImageUrl = await getScreenshotSignedUrl(
    supabase,
    stepPreviewImagePath(step),
  );

  return NextResponse.json({
    step,
    imageUrl,
    localizedImageUrl,
    previewImageUrl,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const body = (await request.json()) as {
    title?: string;
    summary?: string;
  };

  const updates: { title?: string; summary?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) {
      return badRequest("Title cannot be empty.");
    }
    updates.title = title;
  }

  if (body.summary !== undefined) {
    updates.summary = body.summary.trim();
  }

  if (body.title === undefined && body.summary === undefined) {
    return badRequest("Provide title and/or summary to update.");
  }

  const { data: updatedStep, error: updateError } = await supabase
    .from("steps")
    .update(updates)
    .eq("id", stepId)
    .select("*")
    .single();

  if (updateError || !updatedStep) {
    return serverError(updateError?.message ?? "Failed to update step.");
  }

  return NextResponse.json({ step: updatedStep });
}

export async function DELETE(_request: Request, context: RouteContext) {
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

  const pathsToRemove = [step.image_url, step.translated_image_url].filter(
    (path): path is string => Boolean(path),
  );

  if (pathsToRemove.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(SCREENSHOTS_BUCKET)
      .remove(pathsToRemove);

    if (storageError) {
      return serverError(storageError.message);
    }
  }

  const { error: deleteError } = await supabase
    .from("steps")
    .delete()
    .eq("id", stepId);

  if (deleteError) {
    return serverError(deleteError.message);
  }

  return NextResponse.json({
    ok: true,
    flowId: step.flows.id,
  });
}
