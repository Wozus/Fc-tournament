"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TournamentListItem } from "@/lib/types";

function cls(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function Page() {
  const [items, setItems] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const pageSize = 12;

  const [user, setUser] = useState<{ id: string; username: string } | null>(
    null
  );

  const load = async (query: string, pageNo: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: query,
        page: String(pageNo),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/tournaments?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Nie udało się pobrać.");
      setItems(Array.isArray(json?.items) ? json.items : []);
      setTotal(Number(json?.total) || 0);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się pobrać.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(q, page);
  }, [q, page]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setUser(json?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageLabels = useMemo(() => {
    if (totalPages <= 1) return [];
    const labels: string[] = [];
    for (let i = 1; i <= totalPages; i += 1) labels.push(`Strona ${i}`);
    return labels;
  }, [totalPages]);

  return (
    <div className="wrap">
      <header className="header">
        <h1>Turnieje</h1>
        <p className="sub">
          Wszystkie turnieje są publiczne. Zaloguj się, aby tworzyć nowe i
          dodawać mecze.
        </p>
      </header>

      <section className="panel">
        <div className="row">
          <div className="controls">
            {user ? (
              <Link className="btnPrimary" href="/tournaments/new">
                Nowy turniej
              </Link>
            ) : (
              <>
                <Link className="btnPrimary" href="/login">
                  Zaloguj się
                </Link>
                <Link className="btnGhost" href="/register">
                  Rejestracja
                </Link>
              </>
            )}
            {user && (
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
            )}
          </div>

          <div className="controls">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Szukaj po nazwie turnieju lub adminie…"
            />
          </div>
        </div>

        {loading && <div className="muted">Ładowanie turniejów…</div>}
        {error && <div className="error">{error}</div>}
      </section>

      {!loading && items.length === 0 && !error && (
        <section className="panel">
          <div className="muted">Brak turniejów.</div>
        </section>
      )}

      {items.length > 0 && (
        <section className="grid">
          {items.map((t) => (
            <Link key={t.id} className="tile tileLink" href={`/tournaments/${t.id}`}>
              <div className="tileTop">
                <div className="tileNo">{t.name}</div>
                <div className={cls("pill", "pillOn")}>{t.ownerUsername}</div>
              </div>
              <div className="muted tiny">Kliknij, aby zobaczyć mecze</div>
            </Link>
          ))}
        </section>
      )}

      {totalPages > 1 && (
        <section className="pager">
          <div className="pagerTop">
            <div className="pagerTitle">
              Strona {page} / {totalPages}
            </div>
            <div className="pagerNav">
              <button
                type="button"
                className="pagerBtn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Wstecz
              </button>
              <button
                type="button"
                className="pagerBtn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Dalej
              </button>
            </div>
          </div>
          <div className="pagerList">
            {pageLabels.map((label, idx) => (
              <button
                key={label}
                type="button"
                className={cls("pagerItem", page === idx + 1 && "pagerOn")}
                onClick={() => setPage(idx + 1)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
