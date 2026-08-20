import { recordAuditEvent } from "../db/audit.js";
import { insertMessage, touchConversation } from "../db/conversations.js";
import { config } from "../config.js";
import { getSupabaseAdmin } from "./supabase.js";
import { sendWhatsAppTemplate } from "./meta-graph.js";

export type ReheatDecision = "approved" | "rejected";

type ReheatRow = {
  id: string;
  conversation_id: string | null;
  phone: string | null;
  action: string;
  human_decision: string | null;
  suggested_opener: string | null;
};

/**
 * Humano decide um a um. Template de reativação só dispara se approved + action=reheat.
 * Nunca envia em lote; skip/opt-out nunca sai.
 */
export async function decideReheat(input: {
  id: string;
  decision: ReheatDecision;
}): Promise<{
  ok: true;
  sent: boolean;
  note: string;
  externalMessageId?: string;
}> {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error("supabase_off");
  }

  const { data: row, error } = await db
    .from("ir_reheat_scores")
    .select(
      "id, conversation_id, phone, action, human_decision, suggested_opener",
    )
    .eq("id", input.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("reheat_not_found");

  const score = row as ReheatRow;
  if (score.human_decision && score.human_decision !== "pending") {
    throw new Error("already_decided");
  }

  if (input.decision === "rejected") {
    await markDecision(db, score.id, "rejected");
    await recordAuditEvent({
      entityType: "reheat",
      entityId: score.id,
      eventType: "reheat_rejected",
      actorType: "human",
      summary: "Operação rejeitou reaquecimento",
    });
    return { ok: true, sent: false, note: "rejected" };
  }

  if (score.action === "skip") {
    throw new Error("cannot_approve_skip");
  }

  let sent = false;
  let note = "approved";
  let externalMessageId: string | undefined;

  if (score.action === "reheat") {
    const template = process.env.IR_WHATSAPP_TEMPLATE_REHEAT?.trim();
    if (!template) {
      await markDecision(db, score.id, "approved");
      return {
        ok: true,
        sent: false,
        note: "approved_no_template — set IR_WHATSAPP_TEMPLATE_REHEAT",
      };
    }
    if (!score.phone) throw new Error("missing_phone");

    const result = await sendWhatsAppTemplate({
      toE164: score.phone,
      templateName: template,
      languageCode: config.meta.templateLanguage,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    sent = true;
    note = "approved_template_sent";
    externalMessageId = result.externalMessageId;

    if (score.conversation_id) {
      await insertMessage({
        conversationId: score.conversation_id,
        role: "system",
        text: `[template reheat] ${template}`,
        messageType: "template",
        externalMessageId,
        deliveryStatus: "sent",
      });
      await touchConversation(score.conversation_id, {
        status: "awaiting_first_reply",
        lastOutbound: true,
      });
    }
  } else if (score.action === "reanalyze" && score.conversation_id) {
    await touchConversation(score.conversation_id, {
      status: "waiting_documents",
    });
    note = "approved_reanalyze_queue";
  } else if (score.action === "needs_human" && score.conversation_id) {
    await touchConversation(score.conversation_id, {
      status: "waiting_human",
    });
    note = "approved_handoff";
  }

  await markDecision(db, score.id, "approved");
  await recordAuditEvent({
    entityType: "reheat",
    entityId: score.id,
    eventType: sent ? "reheat_sent" : "reheat_approved",
    actorType: "human",
    summary: note,
    metadata: { action: score.action, externalMessageId },
  });

  return { ok: true, sent, note, externalMessageId };
}

async function markDecision(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  id: string,
  decision: ReheatDecision,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from("ir_reheat_scores")
    .update({
      human_decision: decision,
      decided_at: now,
      updated_at: now,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
