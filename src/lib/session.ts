import { cookies } from "next/headers";
import { AUTH_COOKIE, hashToken } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/serverSupabase";

export async function getSessionUser() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { user: null, error: "Brak konfiguracji Supabase (SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return { user: null };

  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const { data: sessionRow } = await supabase
    .from("app_sessions")
    .select("user_id, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", now)
    .single();

  if (!sessionRow) return { user: null };

  const { data: user } = await supabase
    .from("app_users")
    .select("id, username")
    .eq("id", sessionRow.user_id)
    .single();

  if (!user) return { user: null };

  return { user };
}
