"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TournamentDashboard from "@/components/TournamentDashboard";
import type { Tournament } from "@/lib/types";

export default function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [user, setUser] = useState<{ id: string; username: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [tournamentId, setTournamentId] = useState<string | null>(null);

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
    fetch(`/api/tournaments/${tournamentId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? "Nie znaleziono turnieju.");
        }
        return res.json();
      })
      .then((json) => setTournament(json?.tournament ?? null))
      .catch((err) => {
        setError(err?.message ?? "Nie znaleziono turnieju.");
        setTournament(null);
      });

    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setUser(json?.user ?? null))
      .catch(() => setUser(null));
  }, [tournamentId]);

  if (!tournament) {
    return (
      <div className="wrap">
        <section className="panel">
          <div className="muted">Ładowanie turnieju…</div>
          {error && <div className="error">{error}</div>}
        </section>
      </div>
    );
  }

  const isOwner = user?.id === tournament.ownerId;

  return (
    <div className="wrap">
      <section className="panel">
        <div className="row">
          <Link className="btnGhost" href="/">
            Wróć do listy turniejów
          </Link>
          {isOwner && (
            <button
              type="button"
              className="btnGhostRed"
              onClick={async () => {
                const ok = window.confirm(
                  "Usunąć turniej? To usunie też wszystkie mecze."
                );
                if (!ok) return;
                const res = await fetch(`/api/tournaments/${tournament.id}`, {
                  method: "DELETE",
                });
                const json = await res.json();
                if (!res.ok) {
                  setError(json?.error ?? "Nie udało się usunąć turnieju.");
                  return;
                }
                window.location.href = "/";
              }}
            >
              Usuń turniej
            </button>
          )}
          {user ? (
            <button
              type="button"
              className="btnGhost"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                setUser(null);
              }}
            >
              Wyloguj
            </button>
          ) : (
            <Link className="btnGhost" href="/login">
              Zaloguj się
            </Link>
          )}
        </div>
      </section>

      <TournamentDashboard
        tournamentId={tournament.id}
        tournamentName={tournament.name}
        ownerUsername={tournament.ownerUsername}
        players={tournament.players}
        isOwner={Boolean(isOwner)}
      />
    </div>
  );
}
