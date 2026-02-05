import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/serverSupabase";
import { getSessionUser } from "@/lib/session";
import type { Tournament } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const { id } = await params;
  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id, name, owner_id, created_at, owner:app_users!inner(username)")
    .eq("id", id)
    .single();

  if (error || !tournament) {
    return NextResponse.json(
      { error: "Nie znaleziono turnieju." },
      { status: 404 }
    );
  }

  const { data: players } = await supabase
    .from("tournament_players")
    .select("player_name")
    .eq("tournament_id", id)
    .order("player_name", { ascending: true });

  const ownerUsername = Array.isArray(tournament.owner)
    ? tournament.owner[0]?.username
    : tournament.owner?.username;

  const result: Tournament = {
    id: tournament.id,
    name: tournament.name,
    ownerId: tournament.owner_id,
    ownerUsername: ownerUsername ?? "",
    players: (players ?? []).map((p: any) => p.player_name),
    createdAt: tournament.created_at ?? undefined,
  };

  return NextResponse.json({ tournament: result });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const { user, error: authError } = await getSessionUser();
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Wymagane logowanie." }, { status: 401 });
  }

  const { id } = await params;
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, owner_id")
    .eq("id", id)
    .single();

  if (tournamentError || !tournament) {
    return NextResponse.json(
      { error: "Nie znaleziono turnieju." },
      { status: 404 }
    );
  }

  if (tournament.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Brak uprawnień do usunięcia turnieju." },
      { status: 403 }
    );
  }

  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
