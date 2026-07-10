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

export async function getScreenshotSignedUrls(
  supabase: SupabaseClient,
  paths: Array<string | null | undefined>,
  expiresInSeconds = 3600,
) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path): path is string => Boolean(path))),
  );
  const signedUrls: Record<string, string | null> = Object.fromEntries(
    uniquePaths.map((path) => [path, null]),
  );

  if (uniquePaths.length === 0) {
    return signedUrls;
  }

  const { data, error } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .createSignedUrls(uniquePaths, expiresInSeconds);

  if (error || !data) {
    return signedUrls;
  }

  data.forEach((item, index) => {
    const path = item.path ?? uniquePaths[index];
    if (path) {
      signedUrls[path] = item.signedUrl ?? null;
    }
  });

  return signedUrls;
}
