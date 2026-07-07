import { NextResponse } from "next/server";

import {
  badRequest,
  requireUser,
  serverError,
} from "@/lib/api/helpers";

export async function GET() {
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({ projects: data });
}

export async function POST(request: Request) {
  const { user, supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const name =
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  if (!name) {
    return badRequest("Project name is required.");
  }

  const sourceLanguage =
    typeof body === "object" &&
    body !== null &&
    "source_language" in body &&
    typeof body.source_language === "string"
      ? body.source_language.trim() || null
      : null;

  const targetLanguage =
    typeof body === "object" &&
    body !== null &&
    "target_language" in body &&
    typeof body.target_language === "string" &&
    body.target_language.trim()
      ? body.target_language.trim()
      : "en";

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      owner_id: user.id,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    })
    .select("*")
    .single();

  if (error) {
    return serverError(error.message);
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
