import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/serverSupabase";

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
