import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  generateSalt,
  hashPassword,
  hashToken,
  newSessionToken,
  normalizeUsername,
} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/serverSupabase";

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  let payload: { username?: string; password?: string; confirm?: string } | null =
    null;
  try {
    payload = (await req.json()) as {
      username?: string;
      password?: string;
      confirm?: string;
    };
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON." }, { status: 400 });
  }

  const username = normalizeUsername(payload?.username ?? "");
  const password = payload?.password ?? "";
  const confirm = payload?.confirm ?? "";

  if (!username || username.length < 3) {
    return NextResponse.json(
      { error: "Nazwa użytkownika musi mieć min. 3 znaki." },
      { status: 400 }
    );
  }
  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "Hasło musi mieć min. 6 znaków." },
      { status: 400 }
    );
  }
  if (password !== confirm) {
    return NextResponse.json(
      { error: "Hasła nie są takie same." },
      { status: 400 }
    );
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);

  const { data: user, error: insertError } = await supabase
    .from("app_users")
    .insert({
      username,
      password_hash: passwordHash,
      password_salt: salt,
    })
    .select("id, username")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Ta nazwa użytkownika jest już zajęta." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
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
    return NextResponse.json({ error: "Błąd rejestracji." }, { status: 500 });
  }

  const res = NextResponse.json({ user });
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
