import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { NextFunction, Request, Response } from "express";

import { config } from "../config.js";

type WithRawBody = { rawBody?: Buffer };

/** Guarda o corpo bruto: o HMAC da Meta é calculado sobre os bytes originais. */
export function captureRawBody(
  req: IncomingMessage,
  _res: ServerResponse,
  buf: Buffer,
): void {
  (req as IncomingMessage & WithRawBody).rawBody = buf;
}

function signatureMatches(secret: string, raw: Buffer, header: string): boolean {
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("hex")}`;
  const received = Buffer.from(header);
  const digest = Buffer.from(expected);
  if (received.length !== digest.length) return false;
  return crypto.timingSafeEqual(received, digest);
}

/**
 * Sem esta checagem, quem descobrir a URL do webhook cria lead e provoca
 * disparo de template pago. Fora de produção, requisições sem assinatura
 * (curl, scripts/smoke.sh) continuam passando.
 */
export function verifyMetaSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isProduction = config.env === "production";
  const secret = config.meta.appSecret;

  if (!secret) {
    if (isProduction) {
      console.error("[meta-signature] IR_META_APP_SECRET ausente; recusando");
      res.sendStatus(403);
      return;
    }
    console.warn("[meta-signature] IR_META_APP_SECRET ausente: assinatura não verificada");
    next();
    return;
  }

  const header = req.get("x-hub-signature-256");
  if (!header) {
    if (isProduction) {
      console.warn("[meta-signature] requisição sem assinatura recusada");
      res.sendStatus(403);
      return;
    }
    console.warn("[meta-signature] requisição sem assinatura aceita fora de produção");
    next();
    return;
  }

  const raw = (req as Request & WithRawBody).rawBody;
  if (!raw?.length) {
    console.warn("[meta-signature] corpo bruto indisponível; recusando");
    res.sendStatus(403);
    return;
  }

  if (!signatureMatches(secret, raw, header)) {
    console.warn("[meta-signature] assinatura inválida");
    res.sendStatus(403);
    return;
  }

  next();
}
