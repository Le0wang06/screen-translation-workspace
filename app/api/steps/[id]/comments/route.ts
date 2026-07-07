import { NextResponse } from "next/server";

import { getOwnedStep } from "@/lib/api/flows";
import {
  badRequest,
  notFound,
  requireUser,
  serverError,
} from "@/lib/api/helpers";

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

  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("step_id", stepId)
    .order("created_at", { ascending: true });

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({ comments: data ?? [] });
}

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
    return notFound("Step not found.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const text =
    typeof body === "object" &&
    body !== null &&
    "body" in body &&
    typeof body.body === "string"
      ? body.body.trim()
      : "";

  if (!text) {
    return badRequest("Comment body is required.");
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({
      step_id: stepId,
      author_id: user.id,
      body: text,
    })
    .select("*")
    .single();

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({ comment: data }, { status: 201 });
}
