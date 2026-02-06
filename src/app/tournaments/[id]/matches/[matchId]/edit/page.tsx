"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Match, PlayerStats, Tournament } from "@/lib/types";

type PlayerRow = {
  name: string;
  goals: string;
  crossbars: string;
  blackPosts: string;
  club: string;
  host: boolean;
};

function toNumber(value: string) {
  if (!value.trim()) return 0;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function EditMatchPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const router = useRouter();
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [user, setUser] = useState<{ id: string; username: string } | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [matchNo, setMatchNo] = useState<string>("");
  const [winner, setWinner] = useState<string>("");
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [specialText, setSpecialText] = useState<string>("");
  const [specialPlayers, setSpecialPlayers] = useState<string[]>([]);
  const [pointsMultiplier, setPointsMultiplier] = useState<string>("1");

  const hostCount = useMemo(
    () => rows.filter((row) => row.host).length,
    [rows]
  );
  const specialLimitReached = specialPlayers.length >= 2;

  useEffect(() => {
    let mounted = true;
    Promise.resolve(params)
      .then((p) => {
        if (!mounted) return;
        setTournamentId(p.id);
        setMatchId(p.matchId);
      })
      .catch(() => {
        if (!mounted) return;
        setTournamentId(null);
        setMatchId(null);
      });
    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    if (!tournamentId || !matchId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/tournaments/${tournamentId}`, { cache: "no-store" }),
      fetch(`/api/tournaments/${tournamentId}/matches/${matchId}`, {
        cache: "no-store",
      }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ])
      .then(async ([tRes, mRes, uRes]) => {
        if (!tRes.ok) {
          const json = await tRes.json().catch(() => null);
          throw new Error(json?.error ?? "Nie znaleziono turnieju.");
        }
        if (!mRes.ok) {
          const json = await mRes.json().catch(() => null);
          throw new Error(json?.error ?? "Nie znaleziono meczu.");
        }
        const tJson = await tRes.json();
        const mJson = await mRes.json();
        const uJson = uRes.ok ? await uRes.json() : null;
        return { tJson, mJson, uJson };
      })
      .then(({ tJson, mJson, uJson }) => {
        const t = tJson?.tournament ?? null;
        const m = mJson?.match ?? null;
        setTournament(t);
        setMatch(m);
        setUser(uJson?.user ?? null);

        const playersList: string[] = Array.isArray(t?.players)
          ? t.players
          : [];
        const matchPlayers = m?.players ?? {};

        const rowsData = playersList.map((name) => {
          const s = matchPlayers[name] ?? {};
          return {
            name,
            goals: String(s.goals ?? 0),
            crossbars: String(s.crossbars ?? 0),
            blackPosts: String(s.blackPosts ?? 0),
            club: s.club ?? "",
            host: Boolean(s.host),
          };
        });
        if (rowsData.length > 0 && rowsData.every((r) => !r.host)) {
          rowsData[0].host = true;
        }

        setRows(rowsData);
        setMatchNo(String(m?.no ?? ""));
        setWinner(m?.winner ?? "");
        setSpecialText(m?.specialText ?? "");
        setSpecialPlayers(
          Array.isArray(m?.specialPlayers) ? m.specialPlayers : []
        );
        const raw =
          typeof m?.pointsMultiplier === "number"
            ? m.pointsMultiplier
            : m?.pointsMultiplier != null
            ? Number(m.pointsMultiplier)
            : 1;
        setPointsMultiplier(
          Number.isFinite(raw) && raw > 0 ? String(raw) : "1"
        );
      })
      .catch((err) => {
        setError(err?.message ?? "Nie udało się wczytać meczu.");
        setTournament(null);
        setMatch(null);
      })
      .finally(() => setLoading(false));
  }, [tournamentId, matchId]);

  const isOwner = user && tournament ? user.id === tournament.ownerId : false;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tournamentId || !matchId) return;
    const no = Number(matchNo);
    if (!Number.isFinite(no) || no <= 0) {
      setError("Nieprawidłowy numer meczu.");
      return;
    }
    const multiplierValue = pointsMultiplier.trim()
      ? toNumber(pointsMultiplier)
      : 1;
    if (!Number.isFinite(multiplierValue) || multiplierValue <= 0) {
      setError("Mnożnik punktów musi być większy od zera.");
      return;
    }

    const players: Record<string, PlayerStats> = {};
    for (const row of rows) {
      const name = row.name.trim();
      if (!name) continue;
      players[name] = {
        goals: toNumber(row.goals),
        crossbars: toNumber(row.crossbars),
        blackPosts: toNumber(row.blackPosts),
        club: row.club.trim() || undefined,
        host: row.host,
      };
    }

    if (Object.keys(players).length === 0) {
      setError("Dodaj przynajmniej jednego gracza.");
      return;
    }
    if (Object.values(players).filter((p) => p.host).length !== 1) {
      setError("Wybierz dokładnie jednego gospodarza.");
      return;
    }
    if (specialPlayers.length > 2) {
      setError("Wybierz maksymalnie 2 graczy dla cechy specjalnej.");
      return;
    }
    const validSpecialPlayers = specialPlayers.filter((name) => players[name]);

    setSaving(true);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${matchId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            no,
            winner: winner.trim() || null,
            specialText: specialText.trim() || null,
            specialPlayers: validSpecialPlayers,
            pointsMultiplier: multiplierValue,
            players,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Nie udało się zapisać.");
      router.push(`/tournaments/${tournamentId}`);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się zapisać.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="wrap">
        <section className="panel">
          <div className="muted">Ładowanie meczu…</div>
        </section>
      </div>
    );
  }

  if (!tournament || !match) {
    return (
      <div className="wrap">
        <section className="panel">
          <div className="error">{error ?? "Nie znaleziono meczu."}</div>
          <div className="actions">
            <Link className="btnGhost" href="/">
              Wróć do listy turniejów
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="header">
        <h1>Edycja meczu — {tournament.name}</h1>
        <p className="sub">Zmień wynik i zapisz poprawki.</p>
      </header>

      <section className="panel">
        <div className="row">
          <Link className="btnGhost" href={`/tournaments/${tournamentId}`}>
            Wróć do turnieju
          </Link>
        </div>
      </section>

      {!isOwner && (
        <section className="panel">
          <div className="muted">
            Tylko organizator może edytować mecze.
          </div>
        </section>
      )}

      {isOwner && (
        <form className="panel" onSubmit={onSubmit}>
          <div className="formGrid">
            <label className="field">
              <span>Numer meczu</span>
              <input
                type="number"
                value={matchNo}
                readOnly
                placeholder="np. 14"
              />
            </label>
            <label className="field">
              <span>Zwycięzca</span>
              <input
                value={winner}
                onChange={(e) => setWinner(e.target.value)}
                placeholder="np. Jajo"
                list="playerNames"
              />
            </label>
          </div>

          <div className="playerHeader">Cecha specjalna</div>
          <div className="formGrid">
            <label className="field">
              <span>Opis</span>
              <input
                value={specialText}
                onChange={(e) => setSpecialText(e.target.value)}
                placeholder='np. "Mecz w czerwonych okularach"'
              />
            </label>
            <label className="field">
              <span>Mnożnik punktów</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                value={pointsMultiplier}
                onChange={(e) => setPointsMultiplier(e.target.value)}
                placeholder="np. 2"
              />
            </label>
          </div>
          <div className="specialPlayers">
            <div className="muted">
              Wskaż maksymalnie 2 graczy dla cechy specjalnej.
            </div>
            <div className="specialList">
              {rows.map((row) => {
                const checked = specialPlayers.includes(row.name);
                return (
                  <label key={row.name} className="specialItem">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={specialLimitReached && !checked}
                      onChange={() =>
                        setSpecialPlayers((prev) => {
                          if (prev.includes(row.name)) {
                            return prev.filter((p) => p !== row.name);
                          }
                          if (prev.length >= 2) return prev;
                          return [...prev, row.name];
                        })
                      }
                    />
                    {row.name}
                  </label>
                );
              })}
            </div>
          </div>

          <datalist id="playerNames">
            {tournament.players.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="playerHeader">Gracze i statystyki</div>
          {hostCount !== 1 && (
            <div className="error">Wybierz dokładnie jednego gospodarza.</div>
          )}

          <div className="playerList">
            {rows.map((row) => (
              <div key={row.name} className="playerRow playerRowStats">
                <input value={row.name} disabled />
                <input
                  value={row.goals}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.name === row.name ? { ...r, goals: e.target.value } : r
                      )
                    )
                  }
                  placeholder="Gole"
                  inputMode="numeric"
                />
                <input
                  value={row.crossbars}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.name === row.name
                          ? { ...r, crossbars: e.target.value }
                          : r
                      )
                    )
                  }
                  placeholder="Poprzeczki"
                  inputMode="numeric"
                />
                <input
                  value={row.blackPosts}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.name === row.name
                          ? { ...r, blackPosts: e.target.value }
                          : r
                      )
                    )
                  }
                  placeholder="Czarne słupki"
                  inputMode="numeric"
                />
                <input
                  value={row.club}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.name === row.name ? { ...r, club: e.target.value } : r
                      )
                    )
                  }
                  placeholder="Klub"
                />
                <label className="hostToggle">
                  <input
                    type="checkbox"
                    checked={row.host}
                    onChange={() =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.name === row.name
                            ? { ...r, host: !r.host }
                            : { ...r, host: false }
                        )
                      )
                    }
                  />
                  Gospodarz
                </label>
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              type="submit"
              className="btnPrimary"
              disabled={saving || hostCount !== 1}
            >
              {saving ? "Zapisywanie…" : "Zapisz zmiany"}
            </button>
          </div>

          {error && <div className="error">{error}</div>}
        </form>
      )}
    </div>
  );
}
