/**
 * PDF operacional: passo a passo para emitir CNIS e DIRFs.
 * Enviado automaticamente na primeira vez que o agente pede os documentos.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  conversationHasMessageType,
  insertMessage,
  touchConversation,
} from "../db/conversations.js";
import { sendWhatsAppDocument } from "./meta-graph.js";

const FILENAME = "Passo-a-passo-CNIS-e-DIRFS-IR-Consultoria.pdf";
const RELATIVE = "assets/passo-a-passo-cnis-dirfs-2026.pdf";

export const CNIS_GUIDE_CAPTION =
  "No passo a passo está tudo detalhado para baixar o CNIS (Extrato de Contribuições) pelo Meu INSS e das DIRF's (Portal e-cac). Caso fique com qualquer dúvida, estou aqui para te ajudar.";

export function replyAsksForCnis(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.includes("cnis")) return false;
  return (
    t.includes("emitir") ||
    t.includes("enviar") ||
    t.includes("consegue") ||
    t.includes("pdf") ||
    t.includes("meu inss") ||
    t.includes("extrato")
  );
}

function loadGuidePdf(): Buffer | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), RELATIVE),
    resolve(here, "../..", RELATIVE),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path);
    }
  }
  console.error("[cnis-guide] PDF ausente:", RELATIVE);
  return null;
}

/** Uma vez por conversa, depois do pedido dos documentos. */
export async function sendCnisGuideIfNeeded(input: {
  phone: string;
  conversationId?: string;
  replyText: string;
}): Promise<boolean> {
  if (!replyAsksForCnis(input.replyText)) return false;
  if (
    input.conversationId &&
    (await conversationHasMessageType(input.conversationId, "cnis_guide"))
  ) {
    return false;
  }

  const buffer = loadGuidePdf();
  if (!buffer) return false;

  const sent = await sendWhatsAppDocument({
    toE164: input.phone,
    buffer,
    filename: FILENAME,
    caption: CNIS_GUIDE_CAPTION,
  });

  if (!sent.ok) {
    console.error("[cnis-guide] send failed", sent.error);
    return false;
  }

  if (input.conversationId) {
    await insertMessage({
      conversationId: input.conversationId,
      role: "assistant",
      text: CNIS_GUIDE_CAPTION,
      messageType: "cnis_guide",
      externalMessageId: sent.externalMessageId,
      deliveryStatus: "sent",
    });
    await touchConversation(input.conversationId, { lastOutbound: true });
  }

  console.info("[cnis-guide] sent", input.phone);
  return true;
}
