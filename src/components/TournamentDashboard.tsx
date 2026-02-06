"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Match, PlayerTotals, PlayerStats } from "@/lib/types";

function cls(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function calcPoints(
  stats: PlayerStats,
  isWinner: boolean,
  multiplier: number = 1
) {
  const goals = stats.goals ?? 0;
  const crossbars = stats.crossbars ?? 0;
  const blackPosts = stats.blackPosts ?? 0;
  const base = goals + crossbars * 2 + blackPosts * 3 + (isWinner ? 3 : 0);
  return base * multiplier;
}

function getPlayerMultiplier(match: Match, player: string) {
  const raw =
    typeof match.pointsMultiplier === "number"
      ? match.pointsMultiplier
      : match.pointsMultiplier != null
      ? Number(match.pointsMultiplier)
      : 1;
  const multiplier = Number.isFinite(raw) ? raw : 1;
  if (multiplier <= 1) return 1;
  const specialPlayers = Array.isArray(match.specialPlayers)
    ? match.specialPlayers
    : [];
  return specialPlayers.includes(player) ? multiplier : 1;
}

function emptyTotals(): PlayerTotals {
  return { goals: 0, crossbars: 0, blackPosts: 0, wins: 0, totalPoints: 0 };
}

type TournamentDashboardProps = {
  tournamentId: string;
  tournamentName: string;
  ownerUsername: string;
  players: string[];
  isOwner: boolean;
};

export default function TournamentDashboard({
  tournamentId,
  tournamentName,
  ownerUsername,
  players,
  isOwner,
}: TournamentDashboardProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [clubLogos, setClubLogos] = useState<Record<string, string>>({});
  const requestedLogos = useRef<Set<string>>(new Set());

  const [winnerFilter, setWinnerFilter] = useState<string>("ALL");
  const [q, setQ] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 6;

  const loadMatches = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/matches`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Nie udało się pobrać meczów.");
      setMatches(Array.isArray(json?.matches) ? json.matches : []);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się pobrać meczów.");
    } finally {
      setLoading(false);
    }
  };

  const deleteMatch = async (matchId?: string) => {
    if (!matchId) return;
    const ok = window.confirm("Usunąć ten mecz?");
    if (!ok) return;
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${matchId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Nie udało się usunąć meczu.");
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się usunąć meczu.");
    }
  };

  useEffect(() => {
    loadMatches();
  }, [tournamentId]);

  useEffect(() => {
    const clubs = new Set<string>();
    for (const m of matches) {
      for (const s of Object.values(m.players ?? {})) {
        if (s.club) clubs.add(s.club);
      }
    }
    const pending = Array.from(clubs).filter(
      (club) => !clubLogos[club] && !requestedLogos.current.has(club)
    );
    if (pending.length === 0) return;
    pending.forEach((club) => requestedLogos.current.add(club));

    Promise.all(
      pending.map(async (club) => {
        const res = await fetch(
          `/api/club-logo?name=${encodeURIComponent(club)}`
        );
        if (!res.ok) return null;
        const json = await res.json();
        return json?.url ? { club, url: json.url } : null;
      })
    ).then((items) => {
      const next: Record<string, string> = {};
      for (const item of items) {
        if (item?.club && item.url) next[item.club] = item.url;
      }
      if (Object.keys(next).length > 0) {
        setClubLogos((prev) => ({ ...prev, ...next }));
      }
    });
  }, [matches, clubLogos]);

  const allPlayers = useMemo(() => {
    if (players.length > 0) return players;
    const set = new Set<string>();
    for (const m of matches) {
      Object.keys(m.players ?? {}).forEach((p) => set.add(p));
      if (m.winner) set.add(m.winner);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pl"));
  }, [matches, players]);

  const totals = useMemo(() => {
    const acc: Record<string, PlayerTotals> = {};
    const ensure = (p: string) => {
      if (!acc[p]) acc[p] = emptyTotals();
    };

    for (const m of matches) {
      if (m.winner) {
        ensure(m.winner);
        acc[m.winner].wins += 1;
      }
      for (const [p, s] of Object.entries(m.players ?? {})) {
        const stats = s as PlayerStats;
        ensure(p);
        acc[p].goals += stats.goals;
        acc[p].crossbars += stats.crossbars;
        acc[p].blackPosts += stats.blackPosts;
        acc[p].totalPoints += calcPoints(
          stats,
          m.winner === p,
          getPlayerMultiplier(m, p)
        );
      }
    }
    return acc;
  }, [matches]);

  const overall = useMemo(() => {
    return allPlayers.reduce(
      (acc, p) => {
        const t = totals[p] ?? emptyTotals();
        acc.goals += t.goals;
        acc.crossbars += t.crossbars;
        acc.blackPosts += t.blackPosts;
        acc.wins += t.wins;
        acc.points += t.totalPoints;
        return acc;
      },
      { goals: 0, crossbars: 0, blackPosts: 0, wins: 0, points: 0 }
    );
  }, [allPlayers, totals]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (winnerFilter !== "ALL" && m.winner !== winnerFilter) return false;
      if (!q.trim()) return true;
      const qq = q.trim().toLowerCase();
      return String(m.no).includes(qq);
    });
  }, [matches, winnerFilter, q]);

  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageMatches = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredMatches.slice(start, start + pageSize);
  }, [filteredMatches, pageSize, safePage]);

  const pageLabels = useMemo(() => {
    if (!filteredMatches.length) return [];
    return Array.from({ length: totalPages }, (_, idx) => {
      const start = idx * pageSize;
      const end = Math.min(start + pageSize, filteredMatches.length);
      const first = filteredMatches[start]?.no;
      const last = filteredMatches[end - 1]?.no;
      if (first == null) return `Strona ${idx + 1}`;
      if (first === last) return `Mecz #${first}`;
      return `Mecze #${first}–${last}`;
    });
  }, [filteredMatches, pageSize, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [winnerFilter, q, matches]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div>
      <header className="header">
        <h1>{tournamentName}</h1>
        <p className="sub">
          Organizator: {ownerUsername}. Punkty: gole + 2×poprzeczki + 3×czarne
          słupki + 3 za wygraną. Mnożnik punktów dotyczy wskazanych graczy.
        </p>
      </header>

      <section className="panel">
        <div className="row">
          <div className="controls">
            {isOwner && (
              <Link
                className="btnPrimary"
                href={`/tournaments/${tournamentId}/add-match`}
              >
                Dodaj mecz
              </Link>
            )}
            <button type="button" className="btnGhost" onClick={loadMatches}>
              Odśwież
            </button>
          </div>

          {allPlayers.length > 0 && (
            <div className="controls">
              <select
                value={winnerFilter}
                onChange={(e) => setWinnerFilter(e.target.value)}
              >
                <option value="ALL">Wszyscy zwycięzcy</option>
                {allPlayers.map((p) => (
                  <option key={p} value={p}>
                    Zwycięzca: {p}
                  </option>
                ))}
              </select>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtruj po numerze meczu…"
              />
            </div>
          )}
        </div>

        {loading && <div className="muted">Ładowanie meczów…</div>}
        {error && <div className="error">{error}</div>}
      </section>

      {!loading && matches.length === 0 && !error && (
        <section className="panel">
          <div className="muted">
            Brak meczów w bazie. Dodaj pierwszy wpis.
          </div>
        </section>
      )}

      {matches.length > 0 && (
        <>
          <section className="scoreboard">
            {allPlayers.map((p) => {
              const t = totals[p] ?? emptyTotals();
              return (
                <div key={p} className="card">
                  <div className="cardTitle">{p}</div>
                  <div className="big">{t.totalPoints} pkt</div>
                  <div className="muted">
                    Gole: {t.goals} • Wygrane: {t.wins}
                  </div>
                  <div className="muted">
                    Poprzeczki: {t.crossbars} • Czarne słupki: {t.blackPosts}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="meta">
            <div className="metaBox">
              <div className="metaTitle">Statystyki ogólne</div>
              <div className="muted">
                Gole: {overall.goals} • Poprzeczki: {overall.crossbars} • Czarne
                słupki: {overall.blackPosts}
              </div>
              <div className="muted">
                Wygrane: {overall.wins} • Punkty łącznie: {overall.points}
              </div>
            </div>
            <div className="metaBox">
              <div className="metaTitle">Mecze</div>
              <div className="muted">
                Wyświetlane: {filteredMatches.length} / {matches.length}
              </div>
            </div>
          </section>

          {filteredMatches.length > 0 && (
            <section className="pager">
              <div className="pagerTop">
                <div className="pagerTitle">
                  Strona {safePage} / {totalPages}
                </div>
                <div className="pagerNav">
                  <button
                    type="button"
                    className="pagerBtn"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    Wstecz
                  </button>
                  <button
                    type="button"
                    className="pagerBtn"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                  >
                    Dalej
                  </button>
                </div>
              </div>
              <div className="pagerList">
                {pageLabels.map((label, idx) => (
                  <button
                    key={`${idx}-${label}`}
                    type="button"
                    className={cls(
                      "pagerItem",
                      safePage === idx + 1 && "pagerOn"
                    )}
                    onClick={() => setPage(idx + 1)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="grid">
            {pageMatches.map((m) => (
              <div key={m.id ?? m.no} className="tile">
                {(() => {
                  const orderedPlayers =
                    allPlayers.length > 0
                      ? allPlayers.filter((p) => m.players?.[p])
                      : Object.keys(m.players ?? {});
                  const hostEntry = Object.entries(m.players ?? {}).find(
                    ([, s]) => (s as PlayerStats).host
                  );
                  const hostName = hostEntry?.[0];
                  const specialText = m.specialText?.trim() ?? "";
                  const specialPlayers = Array.isArray(m.specialPlayers)
                    ? m.specialPlayers
                    : [];
                  const multiplierRaw =
                    typeof m.pointsMultiplier === "number"
                      ? m.pointsMultiplier
                      : m.pointsMultiplier != null
                      ? Number(m.pointsMultiplier)
                      : 1;
                  const pointsMultiplier = Number.isFinite(multiplierRaw)
                    ? multiplierRaw
                    : 1;
                  const showSpecial =
                    Boolean(specialText) ||
                    specialPlayers.length > 0 ||
                    pointsMultiplier > 1;
                  const specialBlock = showSpecial ? (
                    <div className="matchSpecial">
                      {specialText && (
                        <span className="matchSpecialTitle">
                          {specialText}
                        </span>
                      )}
                      {specialPlayers.length > 0 && (
                        <span className="matchSpecialPlayers">
                          Gracze: {specialPlayers.join(", ")}
                        </span>
                      )}
                      {pointsMultiplier > 1 && (
                        <span className="matchSpecialMultiplier">
                          Mnożnik: x{pointsMultiplier}
                        </span>
                      )}
                    </div>
                  ) : null;

                  if (orderedPlayers.length === 2) {
                    const leftName = orderedPlayers[0];
                    const rightName = orderedPlayers[1];
                    const left = m.players[leftName];
                    const right = m.players[rightName];
                    const leftGoals = left?.goals ?? 0;
                    const rightGoals = right?.goals ?? 0;

                    return (
                      <>
                        <div className="tileTop">
                          <div className="tileNo">Mecz nr. {m.no}</div>
                          <div className="tileActions">
                            {m.winner && (
                              <div className={cls("pill", "pillOn")}>
                                Zwycięzca: {m.winner}
                              </div>
                            )}
                            {hostName && (
                              <div className={cls("pill", "pillOn")}>
                                Gospodarz: {hostName}
                              </div>
                            )}
                            {isOwner && (
                              <>
                                <Link
                                  className="btnGhost btnSmall"
                                  href={`/tournaments/${tournamentId}/matches/${m.id}/edit`}
                                >
                                  Edytuj
                                </Link>
                                <button
                                  type="button"
                                  className="btnGhostRed btnSmall"
                                  onClick={() => deleteMatch(m.id)}
                                >
                                  Usuń
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="matchMain">
                          <div className="matchSide">
                            <div className="matchName">{leftName}</div>
                            <div className="matchClub">
                              {left?.club ? (
                                <span className="clubLine">
                                  {clubLogos[left.club] ? (
                                    <img
                                      className="clubLogo"
                                      src={clubLogos[left.club]}
                                      alt={`${left.club} logo`}
                                    />
                                  ) : (
                                    <span
                                      className="clubLogoPlaceholder"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span>{left.club}</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </div>
                          </div>

                          <div className="matchScore">
                            <div className="matchVs">VS</div>
                            <div className="matchGoals">
                              {leftGoals}:{rightGoals}
                            </div>
                          </div>

                          <div className="matchSide matchSideRight">
                            <div className="matchName">{rightName}</div>
                            <div className="matchClub">
                              {right?.club ? (
                                <span className="clubLine">
                                  {clubLogos[right.club] ? (
                                    <img
                                      className="clubLogo"
                                      src={clubLogos[right.club]}
                                      alt={`${right.club} logo`}
                                    />
                                  ) : (
                                    <span
                                      className="clubLogoPlaceholder"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span>{right.club}</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="matchStats">
                          <div className="matchStat matchStatLeft">
                            <div>(P)‑{left?.crossbars ?? 0}</div>
                            <div>(Cz.Sł.)‑{left?.blackPosts ?? 0}</div>
                          </div>
                          <div className="matchStat matchStatRight">
                            <div>(P)‑{right?.crossbars ?? 0}</div>
                            <div>(Cz.Sł.)‑{right?.blackPosts ?? 0}</div>
                          </div>
                        </div>
                        {specialBlock}
                      </>
                    );
                  }

                  return (
                    <>
                      <div className="tileTop">
                        <div className="tileNo">Mecz nr. {m.no}</div>
                        <div className="tileActions">
                          {m.winner && (
                            <div className={cls("pill", "pillOn")}>
                              Zwycięzca: {m.winner}
                            </div>
                          )}
                          {hostName && (
                            <div className={cls("pill", "pillOn")}>
                              Gospodarz: {hostName}
                            </div>
                          )}
                          {isOwner && (
                            <>
                              <Link
                                className="btnGhost btnSmall"
                                href={`/tournaments/${tournamentId}/matches/${m.id}/edit`}
                              >
                                Edytuj
                              </Link>
                              <button
                                type="button"
                                className="btnGhostRed btnSmall"
                                onClick={() => deleteMatch(m.id)}
                              >
                                Usuń
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {specialBlock}

                      <div className="players">
                        {orderedPlayers.map((p) => {
                          const s = m.players[p];
                          const isWinner = m.winner === p;
                          const multiplier = getPlayerMultiplier(m, p);
                          const points = calcPoints(s, isWinner, multiplier);
                          return (
                            <div
                              key={p}
                              className={cls("pRow", isWinner && "pWin")}
                            >
                              <div className="pName">{p}</div>
                              <div className="pStats">
                                <span>⚽ {s.goals}</span>
                                <span>—</span>
                                <span>┃ {s.crossbars}</span>
                                <span>—</span>
                                <span>▮ {s.blackPosts}</span>
                                {s.club && (
                                  <>
                                    <span>—</span>
                                    <span className="clubLine">
                                      {clubLogos[s.club] ? (
                                        <img
                                          className="clubLogo"
                                          src={clubLogos[s.club]}
                                          alt={`${s.club} logo`}
                                        />
                                      ) : (
                                        <span
                                          className="clubLogoPlaceholder"
                                          aria-hidden="true"
                                        />
                                      )}
                                      <span>{s.club}</span>
                                    </span>
                                  </>
                                )}
                                {s.host && (
                                  <span className="pHost">Gospodarz</span>
                                )}
                              </div>
                              <div className="pPts">
                                {points} pkt
                                {multiplier > 1 && (
                                  <span className="pMultiplier">
                                    {" "}
                                    x{multiplier}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
