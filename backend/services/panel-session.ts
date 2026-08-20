import crypto from "node:crypto";
import type { Request, Response } from "express";

import { config } from "../config.js";

export const SESSION_COOKIE = "ir_panel_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function timingSafePasswordMatch(
  received: string,
  expected: string,
): boolean {
  return timingSafeEqualStr(String(received ?? ""), String(expected ?? ""));
}

/** HMAC secret: env dedicado, senão token do painel (já na VPS), senão hash derivada. */
export function sessionSecret(): string {
  const explicit = process.env.IR_PANEL_SESSION_SECRET?.trim();
  if (explicit && explicit.length >= 32) return explicit;
  if (config.panelToken.length >= 32) return config.panelToken;
  const seed = `ir-panel-session|${config.panelToken}|${config.panelLogin.password}`;
  return crypto.createHash("sha256").update(seed).digest("hex");
}

export function isPanelLoginConfigured(): boolean {
  return Boolean(config.panelLogin.password);
}

export function credentialsMatch(username: string, password: string): boolean {
  if (!isPanelLoginConfigured()) return false;
  const received = password.trim();
  const userOk = timingSafeEqualStr(username.trim(), config.panelLogin.username);
  const passLogin = timingSafePasswordMatch(
    received,
    config.panelLogin.password,
  );
  const token = config.panelToken.trim();
  const passToken = token
    ? timingSafePasswordMatch(received, token)
    : false;
  return userOk && (passLogin || passToken);
}

function cookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: config.env === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

function createSessionValue(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
      role: "panel",
    }),
  );
  return `${payload}.${sign(payload, sessionSecret())}`;
}

export function applySessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, createSessionValue(), cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

function readCookieValue(req: Request, name: string): string | null {
  const raw = req.headers.cookie ?? "";
  const part = raw
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  if (!part) return null;
  try {
    return decodeURIComponent(part.slice(name.length + 1));
  } catch {
    return part.slice(name.length + 1);
  }
}

export function readSession(
  req: Request,
): { role: "panel" | "unknown"; exp: number } | null {
  try {
    const value = readCookieValue(req, SESSION_COOKIE);
    if (!value) return null;
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    if (!timingSafeEqualStr(signature, sign(payload, sessionSecret()))) {
      return null;
    }
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { role?: string; exp?: number };
    const exp = Number(parsed.exp);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { role: parsed.role === "panel" ? "panel" : "unknown", exp };
  } catch {
    return null;
  }
}

export function headerTokenMatches(req: Request): boolean {
  if (!config.panelToken) return false;
  const token =
    req.header("x-ir-panel-token") ??
    req.header("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!token) return false;
  return timingSafePasswordMatch(token, config.panelToken);
}
