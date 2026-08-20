/**
 * Lembrete em texto livre enquanto a janela 24h da Meta ainda está aberta
 * (lead já respondeu, depois parou). Fora da janela use o drip de templates.
 *
 * Ativar: IR_INWINDOW_NUDGE_ENABLED=true
 */
import { config } from "../config.js";
import {
  conversationHasNudgeSince,
  insertMessage,
  listConversationsDueForInWindowNudge,
  touchConversation,
} from "../db/conversations.js";
import { sendWhatsAppText } from "../services/meta-graph.js";

const NUDGE_TEXT =
  "Oi, só conferindo se você ainda quer continuar. Quando puder, me responde por aqui — sem pressa.";

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  const quietHours = Number(process.env.IR_INWINDOW_NUDGE_HOURS || 4);
  const due = await listConversationsDueForInWindowNudge({
    minQuietHours: Number.isFinite(quietHours) ? quietHours : 4,
    windowHours: 24,
    limit: 10,
  });
  if (!due.length) return;

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  for (const conversation of due) {
    if (await conversationHasNudgeSince(conversation.id, since)) continue;

    const sent = await sendWhatsAppText({
      toE164: conversation.phone,
      text: NUDGE_TEXT,
    });
    if (!sent.ok) {
      console.error("[in-window-nudge] send failed", conversation.id, sent.error);
      continue;
    }

    await insertMessage({
      conversationId: conversation.id,
      role: "assistant",
      text: NUDGE_TEXT,
      messageType: "nudge",
      externalMessageId: sent.externalMessageId,
      deliveryStatus: "sent",
    });
    await touchConversation(conversation.id, { lastOutbound: true });
    console.info("[in-window-nudge] sent", conversation.phone);
  }
}

export function startInWindowNudgeWorker(): void {
  if (!config.workers.inWindowNudge) {
    console.info("[in-window-nudge] disabled (IR_INWINDOW_NUDGE_ENABLED)");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, 60_000);
  console.info("[in-window-nudge] started");
  void tick();
}
