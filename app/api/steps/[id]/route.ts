import { NextResponse } from "next/server";

import { getOwnedStep } from "@/lib/api/flows";
import { notFound, requireUser, serverError } from "@/lib/api/helpers";
import { getScreenshotSignedUrl } from "@/lib/storage/signed-url";

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

  const { data: blocks, error: blocksError } = await supabase
    .from("step_blocks")
    .select("*")
    .eq("step_id", stepId)
    .order("position", { ascending: true });

  if (blocksError) {
    return serverError(blocksError.message);
  }

  const imageUrl = await getScreenshotSignedUrl(supabase, step.image_url);

  return NextResponse.json({
    step,
    blocks: blocks ?? [],
    imageUrl,
  });
}
