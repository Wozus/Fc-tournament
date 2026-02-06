import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/serverSupabase";

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
  const { data: lastMatch, error } = await supabase
    .from("matches")
    .select("match_no")
    .eq("tournament_id", id)
    .order("match_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const next = (lastMatch?.match_no ?? 0) + 1;
  return NextResponse.json({ next });
}
