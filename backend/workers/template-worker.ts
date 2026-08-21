import { recordAuditEvent } from "../db/audit.js";
import {
  findOrCreateConversation,
  hasTemplateSentForPhone,
  insertMessage,
  touchConversation,
} from "../db/conversations.js";
import {
  claimLeadForTemplate,
  listStaleTemplateClaims,
  updateLeadStatusById,
  type IrLeadRow,
} from "../db/leads.js";
import { config } from "../config.js";
import { scheduleDripAfterInitialTemplate } from "../services/drip.js";
import { dispatchInitialTemplate } from "../services/template-dispatcher.js";
import { renderTemplateBody } from "../services/template-copy.js";

const TICK_MS = 2000;
const RECOVERY_MS = 60_000;
/** Tempo até considerar um disparo travado (queda entre reserva e resposta da Meta). */
const STALE_CLAIM_MINUTES = 15;
/** Pausa após falha transitória, para não marretar a Graph API a cada tick. */
const TRANSIENT_BACKOFF_MS = 60_000;

let tickTimer: ReturnType<typeof setInterval> | null = null;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let pausedUntil = 0;

/**
 * O lead já está gravado como `template_queued`, então isto só acorda o worker;
 * nada fica em memória e um restart não perde disparos.
 */
export function wakeTemplateWorker(metaLeadgenId?: string): void {
  if (metaLeadgenId) {
    console.info("[template-worker] wake", metaLeadgenId);
  }
  void tick();
}

async function processLead(lead: IrLeadRow): Promise<void> {
  if (!lead.phone) {
    await updateLeadStatusById(lead.id, "invalid");
    console.warn("[template-worker] lead sem telefone", lead.meta_leadgen_id);
    return;
  }

  const leadName = lead.name ?? undefined;
  const result = await dispatchInitialTemplate({
    metaLeadgenId: lead.meta_leadgen_id,
    phoneE164: lead.phone,
    leadName,
  });

  if (!result.ok) {
    console.error("[template-worker] dispatch failed", result);
    if (result.permanent) {
      await updateLeadStatusById(lead.id, "lost");
      await recordAuditEvent({
        entityType: "lead",
        entityId: lead.meta_leadgen_id,
        eventType: "template_failed",
        summary: result.error,
        metadata: { permanent: true },
      });
      return;
    }

    // Transitório: devolve para a fila e espera antes de tentar de novo.
    await updateLeadStatusById(lead.id, "template_queued");
    pausedUntil = Date.now() + TRANSIENT_BACKOFF_MS;
    return;
  }

  await updateLeadStatusById(lead.id, "template_sent");
  await recordAuditEvent({
    entityType: "lead",
    entityId: lead.meta_leadgen_id,
    eventType: "template_sent",
    summary: "Template inicial enviado",
    metadata: { externalMessageId: result.externalMessageId },
  });

  // Persistir o disparo: sem isso o agente responde sem contexto e o inbox
  // mostraria a conversa começando pela resposta do lead.
  let conversationId: string | undefined;
  try {
    const conversation = await findOrCreateConversation({
      phone: lead.phone,
      status: "awaiting_first_reply",
      leadId: lead.id,
      source:
        lead.source?.includes("meta") || lead.source === "meta_lead_ads"
          ? "meta"
          : lead.source ?? "live",
    });
    if (conversation) {
      conversationId = conversation.id;
      const templateName = config.meta.templateInitial || "contato_inicial";
      await insertMessage({
        conversationId: conversation.id,
        role: "assistant",
        text: renderTemplateBody(templateName, leadName ? [leadName] : []),
        messageType: "template",
        externalMessageId: result.externalMessageId,
        deliveryStatus: "sent",
      });
      await touchConversation(conversation.id, {
        status: "awaiting_first_reply",
        lastOutbound: true,
        templateName,
        templateStatus: "sent",
      });
    }
  } catch (err) {
    console.error("[template-worker] persist template message", err);
  }

  await scheduleDripAfterInitialTemplate({
    leadId: lead.id,
    conversationId,
    phone: lead.phone,
  });

  console.info("[template-worker] dispatched", {
    metaLeadgenId: lead.meta_leadgen_id,
    externalMessageId: result.externalMessageId,
  });
}

async function tick(): Promise<void> {
  if (running || Date.now() < pausedUntil) return;
  running = true;
  try {
    const lead = await claimLeadForTemplate();
    if (lead) await processLead(lead);
  } catch (err) {
    console.error("[template-worker] tick", err);
  } finally {
    running = false;
  }
}

/**
 * Devolve à fila os leads reservados por um processo que morreu. Se a conversa
 * já registra o template como enviado, o disparo aconteceu e só o status ficou
 * atrasado — reenviar cobraria a Meta e duplicaria a mensagem para o lead.
 */
async function recoverStaleClaims(): Promise<void> {
  try {
    const stale = await listStaleTemplateClaims(STALE_CLAIM_MINUTES);
    for (const lead of stale) {
      const alreadySent = lead.phone
        ? await hasTemplateSentForPhone(lead.phone)
        : false;

      if (alreadySent) {
        await updateLeadStatusById(lead.id, "template_sent");
        continue;
      }

      await updateLeadStatusById(lead.id, "template_queued");
      await recordAuditEvent({
        entityType: "lead",
        entityId: lead.meta_leadgen_id,
        eventType: "template_requeued",
        summary: `Disparo interrompido há mais de ${STALE_CLAIM_MINUTES} min; reenfileirado`,
        metadata: { leadId: lead.id },
      });
      console.warn("[template-worker] requeued stale claim", lead.meta_leadgen_id);
    }
  } catch (err) {
    console.error("[template-worker] recoverStaleClaims", err);
  }
}

export function startTemplateWorker(): void {
  if (!config.workers.template) {
    console.info("[template-worker] disabled");
    return;
  }
  if (tickTimer) return;

  tickTimer = setInterval(() => {
    void tick();
  }, TICK_MS);
  recoveryTimer = setInterval(() => {
    void recoverStaleClaims();
  }, RECOVERY_MS);
  void recoverStaleClaims();

  console.info("[template-worker] started (fila em ir_leads.status)");
}

export function stopTemplateWorker(): void {
  if (tickTimer) clearInterval(tickTimer);
  if (recoveryTimer) clearInterval(recoveryTimer);
  tickTimer = null;
  recoveryTimer = null;
}
