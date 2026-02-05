import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, hashToken } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/serverSupabase";

export async function POST() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Brak konfiguracji Supabase (SUPABASE_SERVICE_ROLE_KEY).",
      },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await supabase.from("app_sessions").delete().eq("token_hash", tokenHash);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return res;
}
