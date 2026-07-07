import { NextResponse } from "next/server";

import { getOwnedStep } from "@/lib/api/flows";
import { notFound, requireUser, serverError } from "@/lib/api/helpers";
import { getScreenshotSignedUrl } from "@/lib/storage/signed-url";
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
