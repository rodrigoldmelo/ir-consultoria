import { config } from "../config.js";
import {
  findOrCreateConversation,
  insertMessage,
  touchConversation,
} from "../db/conversations.js";
import { insertLead } from "../db/leads.js";
import { getLeadById, updateLeadStatusById } from "../db/leads.js";
import { wakeTemplateWorker } from "../workers/template-worker.js";
import { cancelDripForPhone } from "./drip.js";
import { sendWhatsAppTemplate } from "./meta-graph.js";
import { normalizePhoneE164 } from "./phone.js";
import { firstNameFromLead } from "./post-template-briefing.js";
import { renderTemplateBody } from "./template-copy.js";

export type TestOutreachResult =
  | { ok: true; phone: string; metaLeadgenId: string; leadId?: string }
  | { ok: false; error: string };

/**
 * Enfileira um lead de teste (número pessoal) para disparar `contato_inicial`.
 * Reabre a conversa em `awaiting_first_reply` para o clique em Sim gerar a abertura.
 */
export async function queueTestOutreach(input: {
  phone: string;
  name?: string;
}): Promise<TestOutreachResult> {
  if (!config.meta.templateInitial) {
    return { ok: false, error: "missing_IR_WHATSAPP_TEMPLATE_INITIAL" };
  }

  const phone = normalizePhoneE164(input.phone);
  if (!phone) {
    return { ok: false, error: "invalid_phone" };
  }

  const name = (input.name ?? "").trim() || "Teste";
  const metaLeadgenId = `test-${Date.now()}`;

  const inserted = await insertLead({
    metaLeadgenId,
    phone,
    name,
    optInWhatsapp: true,
    source: "panel_test",
    rawPayload: { source: "panel_test" },
    status: "template_queued",
  });

  if (!inserted) {
    return { ok: false, error: "lead_insert_failed" };
  }

  await cancelDripForPhone(phone, "manual_test_reset");

  const conversation = await findOrCreateConversation({
    phone,
    status: "awaiting_first_reply",
    leadId: inserted.id,
    source: "panel_test",
  });
  if (conversation) {
    await touchConversation(conversation.id, {
      status: "awaiting_first_reply",
      clearInbound: true,
      templateStatus: "queued_test",
    });
  }

  wakeTemplateWorker(metaLeadgenId);

  return {
    ok: true,
    phone,
    metaLeadgenId,
    leadId: inserted.id,
  };
}

export async function queueLeadInitialOutreach(input: {
  leadId: string;
}): Promise<
  | { ok: true; phone: string; metaLeadgenId: string; leadId: string }
  | { ok: false; error: string }
> {
  if (!config.meta.templateInitial) {
    return { ok: false, error: "missing_IR_WHATSAPP_TEMPLATE_INITIAL" };
  }

  const lead = await getLeadById(input.leadId);
  if (!lead) {
    return { ok: false, error: "lead_not_found" };
  }

  const phone = normalizePhoneE164(lead.phone);
  if (!phone) {
    return { ok: false, error: "invalid_phone" };
  }

  await cancelDripForPhone(phone, "manual_initial_outreach");
  await updateLeadStatusById(lead.id, "template_queued");

  const conversation = await findOrCreateConversation({
    phone,
    status: "awaiting_first_reply",
    leadId: lead.id,
    source: lead.source?.includes("meta") ? "meta" : lead.source ?? "import",
  });
  if (conversation) {
    await touchConversation(conversation.id, {
      status: "awaiting_first_reply",
      clearInbound: true,
      templateStatus: "queued_manual",
    });
  }

  wakeTemplateWorker(lead.meta_leadgen_id);

  return {
    ok: true,
    phone,
    metaLeadgenId: lead.meta_leadgen_id,
    leadId: lead.id,
  };
}

export type TestDripWhich = "trust" | "explain";

/**
 * Dispara na hora o template de recuperação (fora da janela 24h).
 * Só funciona depois de o template existir e estar aprovado na Meta.
 */
export async function sendTestDripTemplate(input: {
  phone: string;
  name?: string;
  which: TestDripWhich;
}): Promise<
  | { ok: true; phone: string; templateName: string; externalMessageId: string }
  | { ok: false; error: string }
> {
  const templateName =
    input.which === "explain"
      ? config.meta.templateExplain
      : config.meta.templateTrust;
  if (!templateName) {
    return {
      ok: false,
      error:
        input.which === "explain"
          ? "missing_IR_WHATSAPP_TEMPLATE_EXPLAIN"
          : "missing_IR_WHATSAPP_TEMPLATE_TRUST",
    };
  }

  const phone = normalizePhoneE164(input.phone);
  if (!phone) {
    return { ok: false, error: "invalid_phone" };
  }

  const first = firstNameFromLead(input.name) ?? "olá";
  const result = await sendWhatsAppTemplate({
    toE164: phone,
    templateName,
    languageCode: config.meta.templateLanguage,
    bodyParameters: [first],
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const conversation = await findOrCreateConversation({
    phone,
    status: "awaiting_first_reply",
  });
  if (conversation) {
    await insertMessage({
      conversationId: conversation.id,
      role: "assistant",
      text: renderTemplateBody(templateName, [first]),
      messageType: "template",
      externalMessageId: result.externalMessageId,
      deliveryStatus: "sent",
    });
    await touchConversation(conversation.id, {
      status: "awaiting_first_reply",
      lastOutbound: true,
      templateName,
      templateStatus: `drip_test_${input.which}`,
    });
  }

  return {
    ok: true,
    phone,
    templateName,
    externalMessageId: result.externalMessageId,
  };
}
