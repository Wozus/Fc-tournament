import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/serverSupabase";
import localLogos from "@/data/club-logos.json";

export const runtime = "nodejs";

const CACHE_DAYS = 30;
const LOGO_SIZE = 48;
const BUCKET = process.env.CLUB_LOGO_BUCKET ?? "club-logos";
const NAME_ALIASES: Record<string, string> = {
  "real madryt": "Real Madrid",
  "barcelona": "Barcelona",
  "juventus": "Juventus",
  "liverpool": "Liverpool",
};

function normalize(name: string) {
  return name.trim().toLowerCase();
}

function slugify(name: string) {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "Brak nazwy klubu." },
      { status: 400 }
    );
  }

  const key = normalize(name);
  const apiName = NAME_ALIASES[key] ?? name;
  const localUrl = (localLogos as Record<string, string>)[key];
  if (localUrl) {
    return NextResponse.json({ url: localUrl, source: "local" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const { data: cached } = await supabase
    .from("club_logos")
    .select("storage_path, updated_at")
    .eq("club_name", key)
    .single();

  if (cached?.storage_path && cached.updated_at) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < CACHE_DAYS * 24 * 60 * 60 * 1000) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(cached.storage_path, 60 * 60 * 24 * 30);
      const publicUrl = supabase.storage
        .from(BUCKET)
        .getPublicUrl(cached.storage_path).data.publicUrl;
      return NextResponse.json({
        url: signed?.signedUrl ?? publicUrl,
        source: "cache",
      });
    }
  }

  const apiKey = process.env.SPORTSDB_API_KEY ?? "123";
  const apiUrl = `https://www.thesportsdb.com/api/v1/json/${apiKey}/searchteams.php?t=${encodeURIComponent(
    apiName
  )}`;

  let logoUrl: string | null = null;
  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    const json = await res.json();
    logoUrl = json?.teams?.[0]?.strBadge ?? null;
  } catch {
    logoUrl = null;
  }

  if (logoUrl) {
    const imageRes = await fetch(logoUrl, { cache: "no-store" });
    if (!imageRes.ok) {
      return NextResponse.json({ url: null }, { status: 404 });
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const resized = await sharp(imageBuffer)
      .resize(LOGO_SIZE, LOGO_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const path = `logos/${slugify(name) || "club"}.png`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, resized, {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    const { error: cacheError } = await supabase.from("club_logos").upsert({
      club_name: key,
      storage_path: path,
      source: "thesportsdb",
      updated_at: new Date().toISOString(),
    });
    if (cacheError) {
      return NextResponse.json({ error: cacheError.message }, { status: 500 });
    }

    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    const publicUrl = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path).data.publicUrl;

    return NextResponse.json({
      url: signed?.signedUrl ?? publicUrl,
      source: "api",
    });
  }

  return NextResponse.json({ url: null }, { status: 404 });
}
