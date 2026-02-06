import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/serverSupabase";
import type { Match, MatchInput, PlayerStats } from "@/lib/types";

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(",", ".").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizePlayers(raw: MatchInput["players"]) {
  const players: Record<string, PlayerStats> = {};
  if (!raw || typeof raw !== "object") return players;

  for (const [nameRaw, statsRaw] of Object.entries(raw)) {
    const name = nameRaw.trim();
    if (!name) continue;
    const stats = statsRaw as Partial<PlayerStats>;
    const club = typeof stats.club === "string" ? stats.club.trim() : "";
    players[name] = {
      goals: toNumber(stats.goals),
      crossbars: toNumber(stats.crossbars),
      blackPosts: toNumber(stats.blackPosts),
      club: club || undefined,
      host: Boolean(stats.host),
    };
  }

  return players;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const { id: tournamentId, matchId } = await params;
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, match_no, winner, players, created_at, tournament_id, special_text, special_players, points_multiplier"
    )
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Nie znaleziono meczu." },
      { status: 404 }
    );
  }

  const match: Match = {
    id: data.id,
    tournamentId: data.tournament_id,
    no: data.match_no,
    winner: data.winner ?? null,
    specialText: data.special_text ?? null,
    specialPlayers: Array.isArray(data.special_players)
      ? data.special_players
      : [],
    pointsMultiplier:
      typeof data.points_multiplier === "number"
        ? data.points_multiplier
        : data.points_multiplier
        ? Number(data.points_multiplier)
        : undefined,
    players: (data.players ?? {}) as Record<string, PlayerStats>,
    createdAt: data.created_at ?? undefined,
  };

  return NextResponse.json({ match });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
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

  const { id: tournamentId, matchId } = await params;
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, owner_id")
    .eq("id", tournamentId)
    .single();

  if (tournamentError || !tournament) {
    return NextResponse.json(
      { error: "Nie znaleziono turnieju." },
      { status: 404 }
    );
  }

  if (tournament.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Brak uprawnień do edycji meczu." },
      { status: 403 }
    );
  }

  const { data: playerRows } = await supabase
    .from("tournament_players")
    .select("player_name")
    .eq("tournament_id", tournamentId);

  const allowedPlayers = new Set(
    (playerRows ?? []).map((p: any) => String(p.player_name))
  );

  let payload: MatchInput | null = null;
  try {
    payload = (await req.json()) as MatchInput;
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON." }, { status: 400 });
  }

  const no = Number(payload?.no);
  const winner = payload?.winner ? String(payload.winner).trim() : null;
  const specialText = payload?.specialText
    ? String(payload.specialText).trim()
    : "";
  const specialPlayers = Array.isArray(payload?.specialPlayers)
    ? payload?.specialPlayers.map((p) => String(p))
    : [];
  const pointsMultiplierRaw =
    payload?.pointsMultiplier != null ? Number(payload.pointsMultiplier) : 1;
  const pointsMultiplier =
    Number.isFinite(pointsMultiplierRaw) && pointsMultiplierRaw > 0
      ? pointsMultiplierRaw
      : 1;
  const players = normalizePlayers(payload?.players ?? {});

  if (!Number.isFinite(no) || no <= 0) {
    return NextResponse.json(
      { error: "Nieprawidłowy numer meczu." },
      { status: 400 }
    );
  }
  if (Object.keys(players).length === 0) {
    return NextResponse.json(
      { error: "Dodaj przynajmniej jednego gracza." },
      { status: 400 }
    );
  }
  const hostCount = Object.values(players).filter((p) => p.host).length;
  if (hostCount !== 1) {
    return NextResponse.json(
      { error: "Wybierz dokładnie jednego gospodarza." },
      { status: 400 }
    );
  }

  for (const name of Object.keys(players)) {
    if (!allowedPlayers.has(name)) {
      return NextResponse.json(
        { error: `Nieznany gracz: ${name}` },
        { status: 400 }
      );
    }
  }
  if (winner && !allowedPlayers.has(winner)) {
    return NextResponse.json(
      { error: "Zwycięzca nie jest na liście graczy." },
      { status: 400 }
    );
  }
  const validSpecialPlayers = specialPlayers.filter((p) =>
    allowedPlayers.has(p)
  );
  if (validSpecialPlayers.length > 2) {
    return NextResponse.json(
      { error: "Wybierz maksymalnie 2 graczy dla cechy specjalnej." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("matches")
    .update({
      match_no: Math.trunc(no),
      winner: winner || null,
      players,
      special_text: specialText || null,
      special_players: validSpecialPlayers,
      points_multiplier: pointsMultiplier,
    })
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .select(
      "id, match_no, winner, players, created_at, tournament_id, special_text, special_players, points_multiplier"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const match: Match = {
    id: data.id,
    tournamentId: data.tournament_id,
    no: data.match_no,
    winner: data.winner ?? null,
    specialText: data.special_text ?? null,
    specialPlayers: Array.isArray(data.special_players)
      ? data.special_players
      : [],
    pointsMultiplier:
      typeof data.points_multiplier === "number"
        ? data.points_multiplier
        : data.points_multiplier
        ? Number(data.points_multiplier)
        : undefined,
    players: (data.players ?? {}) as Record<string, PlayerStats>,
    createdAt: data.created_at ?? undefined,
  };

  return NextResponse.json({ match });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
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

  const { id: tournamentId, matchId } = await params;

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, owner_id")
    .eq("id", tournamentId)
    .single();

  if (tournamentError || !tournament) {
    return NextResponse.json(
      { error: "Nie znaleziono turnieju." },
      { status: 404 }
    );
  }

  if (tournament.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Brak uprawnień do usunięcia meczu." },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("id", matchId)
    .eq("tournament_id", tournamentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
