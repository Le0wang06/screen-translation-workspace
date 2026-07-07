import { NextResponse } from "next/server";

import { getOwnedFlow } from "@/lib/api/flows";
import {
  badRequest,
  notFound,
  requireUser,
  serverError,
} from "@/lib/api/helpers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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

  const body = (await request.json()) as { stepIds?: string[] };
  const stepIds = body.stepIds;

  if (!Array.isArray(stepIds) || stepIds.length === 0) {
    return badRequest("stepIds must be a non-empty array.");
  }

  const { data: existingSteps, error: stepsError } = await supabase
    .from("steps")
    .select("id")
    .eq("flow_id", flowId);

  if (stepsError) {
    return serverError(stepsError.message);
  }

  const existingIds = new Set((existingSteps ?? []).map((step) => step.id));

  if (stepIds.length !== existingIds.size) {
    return badRequest("stepIds must include every step in the flow.");
  }

  for (const stepId of stepIds) {
    if (!existingIds.has(stepId)) {
      return badRequest("stepIds contains an unknown step.");
    }
  }

  const updates = await Promise.all(
    stepIds.map((stepId, position) =>
      supabase
        .from("steps")
        .update({ position, updated_at: new Date().toISOString() })
        .eq("id", stepId)
        .eq("flow_id", flowId),
    ),
  );

  const updateError = updates.find((result) => result.error)?.error;
  if (updateError) {
    return serverError(updateError.message);
  }

  const { data: steps, error: fetchError } = await supabase
    .from("steps")
    .select("*")
    .eq("flow_id", flowId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchError) {
    return serverError(fetchError.message);
  }

  return NextResponse.json({ steps });
}
