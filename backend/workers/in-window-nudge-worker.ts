/**
 * Lembrete em texto livre enquanto a janela 24h da Meta ainda está aberta
 * (lead já respondeu, depois parou). Fora da janela use o drip de templates.
 *
 * Ativar: IR_INWINDOW_NUDGE_ENABLED=true
 */
import { config } from "../config.js";
import {
  conversationHasMessageType,
  conversationHasNudgeSince,
  insertMessage,
  listConversationsDueForInWindowNudge,
  touchConversation,
} from "../db/conversations.js";
import { getLeadById } from "../db/leads.js";
import { firstNameFromLead } from "../services/post-template-briefing.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import { sendWhatsAppText } from "../services/meta-graph.js";

const DEFAULT_DOCUMENT_NUDGE_TEXT =
  "Dr(a). {{1}}, passando só para lembrar do envio do CNIS e das DIRF's/rendimentos.\n\nCom esses documentos, nossa equipe consegue fazer uma análise bem mais precisa do seu caso.\n\nSe tiver qualquer dificuldade para baixar, pode me chamar por aqui que eu te ajudo.";

let timer: ReturnType<typeof setInterval> | null = null;

async function conversationHasAnyRequiredDocument(
  conversationId: string,
): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return true;

  const { data, error } = await db
    .from("ir_documents")
    .select("id")
    .eq("conversation_id", conversationId)
    .in("document_type", ["cnis", "dirf_income"])
    .limit(1);

  if (error) {
    console.error("[in-window-nudge] document lookup", error.message);
    return true;
  }
  return Boolean(data?.length);
}

async function buildDocumentNudgeText(leadId: string | null): Promise<string> {
  let firstName = "";
  if (leadId) {
    const lead = await getLeadById(leadId);
    firstName = firstNameFromLead(lead?.name) ?? "";
  }

  const template =
    process.env.IR_DOCUMENT_INWINDOW_NUDGE_TEXT?.trim() ||
    DEFAULT_DOCUMENT_NUDGE_TEXT;
  if (!firstName) {
    return template
      .replace(/Dr\(a\)\.\s*\{\{1\}\},?/g, "Dr(a),")
      .replace(/\{\{1\}\}/g, "");
  }
  return template.replace(/\{\{1\}\}/g, firstName);
}

async function tick(): Promise<void> {
  const quietHours = Number(process.env.IR_DOCUMENT_INWINDOW_NUDGE_HOURS || 20);
  const due = await listConversationsDueForInWindowNudge({
    minQuietHours: Number.isFinite(quietHours) ? quietHours : 20,
    windowHours: 24,
    limit: 10,
  });
  if (!due.length) return;

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  for (const conversation of due) {
    if (await conversationHasNudgeSince(conversation.id, since)) continue;
    if (!(await conversationHasMessageType(conversation.id, "cnis_guide"))) continue;
    if (await conversationHasAnyRequiredDocument(conversation.id)) continue;

    const nudgeText = await buildDocumentNudgeText(conversation.lead_id);

    const sent = await sendWhatsAppText({
      toE164: conversation.phone,
      text: nudgeText,
    });
    if (!sent.ok) {
      console.error("[in-window-nudge] send failed", conversation.id, sent.error);
      continue;
    }

    await insertMessage({
      conversationId: conversation.id,
      role: "assistant",
      text: nudgeText,
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
