"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type PlayerRow = {
  id: string;
  name: string;
};

const makeId = () => `row_${Math.random().toString(36).slice(2, 9)}`;

const emptyRow = (): PlayerRow => ({
  id: makeId(),
  name: "",
});

export default function NewTournamentPage() {
  const router = useRouter();
  const [name, setName] = useState<string>("");
  const [rows, setRows] = useState<PlayerRow[]>([emptyRow(), emptyRow()]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; username: string } | null>(
    null
  );
  const [authReady, setAuthReady] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setUser(json?.user ?? null);
        setAuthReady(true);
      })
      .catch(() => {
        setUser(null);
        setAuthReady(true);
      });
  }, []);

  const updateRow = (id: string, patch: Partial<PlayerRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const players = rows
      .map((r) => r.name.trim())
      .filter(Boolean);

    if (!name.trim()) {
      setError("Podaj nazwę turnieju.");
      return;
    }
    if (players.length < 2) {
      setError("Dodaj przynajmniej 2 graczy.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, players }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Nie udało się utworzyć.");

      router.push(`/tournaments/${json.tournament.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się utworzyć.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wrap">
      <header className="header">
        <h1>Nowy turniej</h1>
        <p className="sub">Wpisz nazwę turnieju i listę graczy.</p>
      </header>

      <section className="panel">
        <div className="row">
          <Link className="btnGhost" href="/">
            Wróć do listy turniejów
          </Link>
        </div>
      </section>

      {authReady && !user && (
        <section className="panel">
          <div className="muted">Musisz być zalogowany.</div>
          <div className="actions">
            <Link className="btnPrimary" href="/login">
              Zaloguj się
            </Link>
          </div>
        </section>
      )}

      {user && (
        <form className="panel" onSubmit={onSubmit}>
          <div className="formGrid">
            <label className="field">
              <span>Nazwa turnieju</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Hiperturniej"
                required
              />
            </label>
          </div>

          <div className="playerHeader">Gracze</div>
          <div className="playerList">
            {rows.map((row) => (
              <div key={row.id} className="playerRow playerRowSimple">
                <input
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  placeholder="Imię gracza"
                />
                <button
                  type="button"
                  className="btnGhost"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length <= 2}
                >
                  Usuń
                </button>
              </div>
            ))}
          </div>

          <div className="actions">
            <button type="button" className="btnGhost" onClick={addRow}>
              Dodaj gracza
            </button>
            <button type="submit" className="btnPrimary" disabled={loading}>
              {loading ? "Tworzenie…" : "Utwórz turniej"}
            </button>
          </div>

          {error && <div className="error">{error}</div>}
        </form>
      )}
    </div>
  );
}
