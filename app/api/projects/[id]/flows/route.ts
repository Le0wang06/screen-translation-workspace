import { NextResponse } from "next/server";

import {
  badRequest,
  notFound,
  requireUser,
  serverError,
} from "@/lib/api/helpers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function getOwnedProject(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  projectId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    return { project: null, error };
  }

  if (!data) {
    return { project: null, error: null };
  }

  return { project: data, error: null };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { project, error: projectError } = await getOwnedProject(
    supabase,
    projectId,
    user.id,
  );

  if (projectError) {
    return serverError(projectError.message);
  }

  if (!project) {
    return notFound("项目不存在。");
  }

  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({ flows: data });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { project, error: projectError } = await getOwnedProject(
    supabase,
    projectId,
    user.id,
  );

  if (projectError) {
    return serverError(projectError.message);
  }

  if (!project) {
    return notFound("项目不存在。");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON 内容无效。");
  }

  const name =
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  if (!name) {
    return badRequest("请输入流程名称。");
  }

  const { data: existingFlows, error: positionError } = await supabase
    .from("flows")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);

  if (positionError) {
    return serverError(positionError.message);
  }

  const nextPosition = (existingFlows?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("flows")
    .insert({
      name,
      project_id: projectId,
      position: nextPosition,
    })
    .select("*")
    .single();

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({ flow: data }, { status: 201 });
}
