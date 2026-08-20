import { Router } from "express";

import {
  applySessionCookie,
  clearSessionCookie,
  credentialsMatch,
  isPanelLoginConfigured,
  readSession,
} from "../services/panel-session.js";

const router = Router();

router.post("/login", (req, res) => {
  if (!isPanelLoginConfigured()) {
    res.status(503).json({
      error:
        "Login do painel não configurado. Defina IR_PANEL_LOGIN_PASSWORD ou IR_PANEL_TOKEN no servidor.",
    });
    return;
  }

  const username =
    typeof req.body?.username === "string" ? req.body.username : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!credentialsMatch(username, password)) {
    res.status(401).json({ error: "Usuário ou senha inválidos" });
    return;
  }

  try {
    applySessionCookie(res);
  } catch (err) {
    console.error("[panel login] session cookie:", err);
    res.status(503).json({
      error:
        "Sessão do painel não configurada. Verifique IR_PANEL_SESSION_SECRET.",
    });
    return;
  }

  res.status(200).json({ ok: true });
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});

router.get("/me", (req, res) => {
  const session = readSession(req);
  if (session?.role !== "panel") {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.status(200).json({
    authenticated: true,
    expiresAt: new Date(session.exp * 1000).toISOString(),
  });
});

export default router;
