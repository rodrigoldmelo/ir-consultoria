/**
 * Verifica o middleware de assinatura dos webhooks Meta.
 *
 * Usa um payload de `statuses` vazio: passa pelo middleware sem criar lead,
 * conversa ou mensagem, então pode rodar contra qualquer ambiente.
 *
 *   npm run check:webhook
 *   IR_WEBHOOK_BASE_URL=https://ir.meuanalistacrm.app npm run check:webhook
 */
import crypto from "node:crypto";

import "../backend/env.js";
import { config } from "../backend/config.js";

const baseUrl = (
  process.env.IR_WEBHOOK_BASE_URL ?? `http://localhost:${config.port}`
).replace(/\/$/, "");
const target = `${baseUrl}/api/ir/webhooks/whatsapp`;
const payload = JSON.stringify({
  entry: [{ changes: [{ value: { statuses: [] } }] }],
});

async function post(signature?: string): Promise<number> {
  const res = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-hub-signature-256": signature } : {}),
    },
    body: payload,
  });
  return res.status;
}

function sign(secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
}

async function main(): Promise<void> {
  const secret = config.meta.appSecret;
  const localEnv = config.env === "production";
  const remoteTarget = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl);
  // O .env.local do Mac é development; o servidor em ir. é production.
  // O critério é o alvo, não o laptop.
  const expectStrict = localEnv || remoteTarget;

  console.log(`Alvo: ${target}`);
  console.log(`Ambiente local: ${config.env}${remoteTarget ? " (alvo remoto → espera regras de produção)" : ""}`);
  console.log(`IR_META_APP_SECRET: ${secret ? "configurado" : "AUSENTE"}\n`);

  if (!secret) {
    console.error("Sem IR_META_APP_SECRET não há o que verificar.");
    process.exit(1);
  }

  const failures: string[] = [];

  const unsigned = await post();
  const unsignedExpected = expectStrict ? 403 : 200;
  console.log(
    `sem assinatura      → ${unsigned} (esperado ${unsignedExpected}${
      expectStrict ? "" : "; fora de produção é tolerado"
    })`,
  );
  if (unsigned !== unsignedExpected) failures.push("sem assinatura");

  const tampered = await post(sign(`${secret}-errado`));
  console.log(`assinatura inválida → ${tampered} (esperado 403)`);
  if (tampered !== 403) failures.push("assinatura inválida");

  const valid = await post(sign(secret));
  console.log(`assinatura válida   → ${valid} (esperado 200)`);
  if (valid !== 200) failures.push("assinatura válida");

  if (failures.length) {
    console.error(`\nFalhou: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\nAssinatura de webhook OK.");
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : err);
  process.exit(1);
});
