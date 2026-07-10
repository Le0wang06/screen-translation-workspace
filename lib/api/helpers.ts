import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      supabase,
      unauthorized: NextResponse.json({ error: "未登录。" }, { status: 401 }),
    };
  }

  return { user, supabase, unauthorized: null };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "未找到。") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = "服务器错误。") {
  return NextResponse.json({ error: message }, { status: 500 });
}
