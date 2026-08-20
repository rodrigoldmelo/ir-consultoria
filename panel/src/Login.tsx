import { FormEvent, useState } from "react";
import { login } from "./api";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-brand" aria-label="IR Consultoria">
        <div className="login-mark">
          <span className="login-icon">IR</span>
          <div>
            <p className="login-brand-title">IR Consultoria</p>
            <p className="login-brand-sub">Painel operacional</p>
          </div>
        </div>
        <div className="login-hero">
          <h1>Acesso seguro ao painel</h1>
          <p>
            Entre para acompanhar leads, conversas do WhatsApp e a fila de
            documentos da Restituição do INSS.
          </p>
        </div>
        <p className="login-footnote">IR Consultoria · WhatsApp Cloud API</p>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={(e) => void onSubmit(e)}>
          <h2>Entrar</h2>
          <p className="login-lead">Use o usuário e a senha do painel.</p>

          <label htmlFor="username">Usuário</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" disabled={busy}>
            {busy ? "Entrando..." : "Acessar painel"}
          </button>
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
