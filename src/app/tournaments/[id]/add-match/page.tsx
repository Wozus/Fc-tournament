"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { PlayerStats, Tournament } from "@/lib/types";

type PlayerRow = {
  name: string;
  goals: string;
  crossbars: string;
  blackPosts: string;
  points: string;
};

function toNumber(value: string) {
  if (!value.trim()) return 0;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function AddMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [user, setUser] = useState<{ id: string; username: string } | null>(
    null
  );
  const [loadingTournament, setLoadingTournament] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tournamentId, setTournamentId] = useState<string | null>(null);

  const [matchNo, setMatchNo] = useState<string>("");
  const [winner, setWinner] = useState<string>("");
  const [rows, setRows] = useState<PlayerRow[]>([]);

  useEffect(() => {
    let mounted = true;
    Promise.resolve(params)
      .then((p) => {
        if (mounted) setTournamentId(p.id);
      })
      .catch(() => {
        if (mounted) setTournamentId(null);
      });
    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    if (!tournamentId) return;
    setLoadingTournament(true);
    fetch(`/api/tournaments/${tournamentId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? "Nie znaleziono turnieju.");
        }
        return res.json();
      })
      .then((json) => {
        setTournament(json?.tournament ?? null);
        const players = Array.isArray(json?.tournament?.players)
          ? json.tournament.players
          : [];
        setRows(
          players.map((name: string) => ({
            name,
            goals: "",
            crossbars: "",
            blackPosts: "",
            points: "",
          }))
        );
      })
      .catch((err) => {
        setError(err?.message ?? "Nie znaleziono turnieju.");
        setTournament(null);
      })
      .finally(() => setLoadingTournament(false));

    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setUser(json?.user ?? null))
      .catch(() => setUser(null));
  }, [tournamentId]);

  const isOwner = useMemo(() => {
    if (!user || !tournament) return false;
    return user.id === tournament.ownerId;
  }, [user, tournament]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const no = Number(matchNo);
    if (!Number.isFinite(no) || no <= 0) {
      setError("Podaj poprawny numer meczu.");
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
        points: toNumber(row.points),
      };
    }

    if (Object.keys(players).length === 0) {
      setError("Dodaj przynajmniej jednego gracza.");
      return;
    }

    setLoading(true);
    try {
      if (!tournamentId) {
        throw new Error("Brak ID turnieju.");
      }
      const res = await fetch(`/api/tournaments/${tournamentId}/matches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          no,
          winner: winner.trim() || null,
          players,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Nie udało się zapisać meczu.");

      setSuccess("Mecz zapisany.");
      setMatchNo("");
      setWinner("");
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          goals: "",
          crossbars: "",
          blackPosts: "",
          points: "",
        }))
      );
      router.push(`/tournaments/${tournamentId}`);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się zapisać meczu.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingTournament) {
    return (
      <div className="wrap">
        <section className="panel">
          <div className="muted">Ładowanie turnieju…</div>
        </section>
      </div>
    );
  }
  if (!tournament) {
    return (
      <div className="wrap">
        <section className="panel">
          <div className="error">{error ?? "Nie znaleziono turnieju."}</div>
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
        <h1>Dodaj mecz — {tournament.name}</h1>
        <p className="sub">Uzupełnij wynik dla wszystkich graczy turnieju.</p>
      </header>

      <section className="panel">
        <div className="row">
          <Link className="btnGhost" href={`/tournaments/${tournamentId ?? ""}`}>
            Wróć do turnieju
          </Link>
        </div>
      </section>

      {user && !isOwner && (
        <section className="panel">
          <div className="muted">
            Tylko organizator może dodawać mecze.
          </div>
        </section>
      )}

      {!user && (
        <section className="panel">
          <div className="muted">Musisz być zalogowany.</div>
          <div className="actions">
            <Link className="btnPrimary" href="/login">
              Zaloguj się
            </Link>
          </div>
        </section>
      )}

      {user && isOwner && (
        <form className="panel" onSubmit={onSubmit}>
          <div className="formGrid">
            <label className="field">
              <span>Numer meczu</span>
              <input
                type="number"
                inputMode="numeric"
                value={matchNo}
                onChange={(e) => setMatchNo(e.target.value)}
                placeholder="np. 14"
                min={1}
                required
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

          <datalist id="playerNames">
            {tournament.players.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="playerHeader">Gracze i statystyki</div>

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
                  value={row.points}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.name === row.name ? { ...r, points: e.target.value } : r
                      )
                    )
                  }
                  placeholder="Punkty"
                  inputMode="numeric"
                />
              </div>
            ))}
          </div>

          <div className="actions">
            <button type="submit" className="btnPrimary" disabled={loading}>
              {loading ? "Zapisywanie…" : "Zapisz mecz"}
            </button>
          </div>

          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}
        </form>
      )}
    </div>
  );
}
