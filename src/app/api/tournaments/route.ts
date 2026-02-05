import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/serverSupabase";
import type { TournamentListItem } from "@/lib/types";

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = parseIntParam(url.searchParams.get("page"), 1);
  const pageSizeRaw = parseIntParam(url.searchParams.get("pageSize"), 12);
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("tournaments")
    .select("id, name, created_at, owner_id, owner:app_users!inner(username)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    const escaped = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or(
      `name.ilike.%${escaped}%,owner.username.ilike.%${escaped}%`
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items: TournamentListItem[] = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    ownerUsername: row.owner?.username ?? "",
    createdAt: row.created_at ?? undefined,
  }));

  return NextResponse.json({
    items,
    page,
    pageSize,
    total: count ?? items.length,
  });
}

export async function POST(req: Request) {
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

  let payload: { name?: string; players?: string[] } | null = null;
  try {
    payload = (await req.json()) as { name?: string; players?: string[] };
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON." }, { status: 400 });
  }

  const name = (payload?.name ?? "").trim();
  const rawPlayers = Array.isArray(payload?.players) ? payload?.players : [];
  const players = rawPlayers
    .map((p) => String(p).trim())
    .filter(Boolean);

  if (!name) {
    return NextResponse.json({ error: "Podaj nazwę turnieju." }, { status: 400 });
  }
  if (players.length < 2) {
    return NextResponse.json(
      { error: "Dodaj przynajmniej 2 graczy." },
      { status: 400 }
    );
  }

  const { data: tournament, error: insertError } = await supabase
    .from("tournaments")
    .insert({ name, owner_id: user.id })
    .select("id, name, owner_id, created_at")
    .single();

  if (insertError || !tournament) {
    return NextResponse.json(
      { error: insertError?.message ?? "Nie udało się utworzyć turnieju." },
      { status: 500 }
    );
  }

  const playerRows = players.map((playerName) => ({
    tournament_id: tournament.id,
    player_name: playerName,
  }));

  const { error: playersError } = await supabase
    .from("tournament_players")
    .insert(playerRows);

  if (playersError) {
    await supabase.from("tournaments").delete().eq("id", tournament.id);
    return NextResponse.json(
      { error: playersError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    tournament: {
      id: tournament.id,
      name: tournament.name,
      ownerId: tournament.owner_id,
      ownerUsername: user.username,
      players,
      createdAt: tournament.created_at ?? undefined,
    },
  });
}
