import type { requireUser } from "@/lib/api/helpers";
import { SCREENSHOTS_BUCKET } from "@/lib/storage/screenshots";

type SupabaseClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

export async function getScreenshotSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSeconds = 3600,
) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}
