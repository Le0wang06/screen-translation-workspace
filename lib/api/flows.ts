import type { requireUser } from "@/lib/api/helpers";

type SupabaseClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

export async function getOwnedFlow(
  supabase: SupabaseClient,
  flowId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("flows")
    .select("*, projects!inner(id, name, owner_id, source_language, target_language)")
    .eq("id", flowId)
    .eq("projects.owner_id", userId)
    .maybeSingle();

  if (error) {
    return { flow: null, error };
  }

  if (!data) {
    return { flow: null, error: null };
  }

  return { flow: data, error: null };
}

export async function getOwnedStep(
  supabase: SupabaseClient,
  stepId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("steps")
    .select(
      "*, flows!inner(id, name, project_id), projects!inner(id, name, owner_id, source_language, target_language)",
    )
    .eq("id", stepId)
    .eq("projects.owner_id", userId)
    .maybeSingle();

  if (error) {
    return { step: null, error };
  }

  if (!data) {
    return { step: null, error: null };
  }

  return { step: data, error: null };
}
