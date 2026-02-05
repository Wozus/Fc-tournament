"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; username: string } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setUser(json?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error ?? "Nie udało się zalogować.");
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/");
  };

  return (
    <div className="wrap">
      <header className="header">
        <h1>Logowanie</h1>
        <p className="sub">Tylko zalogowani użytkownicy mogą dodawać mecze.</p>
      </header>

      <section className="panel">
        <div className="row">
          <Link className="btnGhost" href="/">
            Wróć do listy turniejów
          </Link>
          <Link className="btnGhost" href="/register">
            Załóż konto
          </Link>
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
      </section>

      {user ? (
        <section className="panel">
          <div className="muted">
            Zalogowany jako <strong>{user.username}</strong>.
          </div>
          <div className="actions">
            <Link className="btnPrimary" href="/tournaments/new">
              Nowy turniej
            </Link>
          </div>
        </section>
      ) : (
        <form className="panel" onSubmit={onSubmit}>
          <div className="formGrid">
            <label className="field">
              <span>Nazwa użytkownika</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="np. admin"
                required
              />
            </label>
            <label className="field">
              <span>Hasło</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Twoje hasło"
                required
              />
            </label>
          </div>

          <div className="actions">
            <button type="submit" className="btnPrimary" disabled={loading}>
              {loading ? "Logowanie…" : "Zaloguj"}
            </button>
          </div>

          {error && <div className="error">{error}</div>}
        </form>
      )}
    </div>
  );
}
