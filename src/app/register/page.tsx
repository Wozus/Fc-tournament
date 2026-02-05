"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, confirm }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error ?? "Nie udało się zarejestrować.");
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/");
  };

  return (
    <div className="wrap">
      <header className="header">
        <h1>Rejestracja</h1>
        <p className="sub">Załóż konto, aby tworzyć turnieje i dodawać mecze.</p>
      </header>

      <section className="panel">
        <div className="row">
          <Link className="btnGhost" href="/">
            Wróć do listy turniejów
          </Link>
          <Link className="btnGhost" href="/login">
            Mam już konto
          </Link>
        </div>
      </section>

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
              placeholder="Minimum 6 znaków"
              required
            />
          </label>
          <label className="field">
            <span>Powtórz hasło</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Powtórz hasło"
              required
            />
          </label>
        </div>

        <div className="actions">
          <button type="submit" className="btnPrimary" disabled={loading}>
            {loading ? "Rejestracja…" : "Utwórz konto"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
