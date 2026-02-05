import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  hashToken,
  newSessionToken,
  normalizeUsername,
  verifyPassword,
} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/serverSupabase";

export async function POST(req: Request) {
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

  let payload: { username?: string; password?: string } | null = null;
  try {
    payload = (await req.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON." }, { status: 400 });
  }

  const username = normalizeUsername(payload?.username ?? "");
  const password = payload?.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Podaj nazwę użytkownika i hasło." },
      { status: 400 }
    );
  }

  const { data: user, error } = await supabase
    .from("app_users")
    .select("id, username, password_hash, password_salt")
    .eq("username", username)
    .single();

  if (error || !user) {
    return NextResponse.json(
      { error: "Nieprawidłowy login lub hasło." },
      { status: 401 }
    );
  }

  const ok = verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: "Nieprawidłowy login lub hasło." },
      { status: 401 }
    );
  }

  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  const { error: sessionError } = await supabase.from("app_sessions").insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  if (sessionError) {
    return NextResponse.json({ error: "Błąd logowania." }, { status: 500 });
  }

  const res = NextResponse.json({
    user: { id: user.id, username: user.username },
  });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return res;
}
