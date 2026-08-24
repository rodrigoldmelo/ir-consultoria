import { getLeadById, findLeadByPhone, insertLead, updateLeadName } from "../db/leads.js";
import { recordAuditEvent } from "../db/audit.js";
import { suppressPhone } from "../db/opt-outs.js";
import {
  findOrCreateConversation,
  insertMessage,
  listRecentMessages,
  messageExistsByExternalId,
  setConversationLead,
  touchConversation,
} from "../db/conversations.js";
import { sendWhatsAppText } from "./meta-graph.js";
import { sendCnisGuideIfNeeded } from "./cnis-guide.js";
import {
  generateAgentReply,
  generateFirstContactReply,
  isOpenAiConfigured,
} from "./openai-agent.js";
import {
  cancelDocumentReminderForConversation,
  cancelDripForPhone,
} from "./drip.js";
import { documentAckMessage, storeInboundDocument } from "./documents.js";
import { normalizePhoneE164 } from "./phone.js";
import {
  extractGivenName,
  firstNameFromLead,
  honorificName,
  isTemplateAccept,
  renderPostTemplateBriefing,
} from "./post-template-briefing.js";
import type { IrLeadRow } from "../db/leads.js";

function isOptOut(text: string): boolean {
  return (
    text.includes("parar") ||
    text.includes("não quero") ||
    text.includes("nao quero") ||
    // botões "Não tenho interesse" / "Não tenho mais interesse" do template inicial
    text.includes("não tenho mais interesse") ||
    text.includes("nao tenho mais interesse") ||
    text.includes("não tenho interesse") ||
    text.includes("nao tenho interesse") ||
    text.includes("sem interesse") ||
    text.includes("opt out") ||
    text.includes("remover") ||
    text.includes("descadastrar") ||
    text.includes("cancelar contato")
  );
}

function wantsHuman(text: string): boolean {
  return (
    text.includes("humano") ||
    text.includes("atendente") ||
    text.includes("falar com uma pessoa") ||
    text.includes("quero uma pessoa") ||
    text.includes("advogado") ||
    text.includes("advogada")
  );
}

function fallbackReply(
  action: "qualify" | "document" | "media",
  honorific?: string | null,
): string {
  const who = action === "qualify" && honorific ? `${honorific}, ` : "";
  if (action === "media") {
    return `${who}Recebi seu arquivo. Vou registrar e, se faltar algum documento, te aviso. Enquanto isso, pode me confirmar se você contribui ou contribuiu para o INSS?`;
  }
  if (action === "document") {
    return [
      "Ótimo! Agora, vou precisar que você envie o CNIS (Extrato de Contribuições do INSS) para que nossa equipe faça a triagem.",
      "Também vamos precisar das informações de rendimentos/DIRFs para uma análise mais precisa. Vou te enviar um único passo a passo com as orientações para baixar o CNIS pelo Meu INSS e as DIRF's pelo Portal e-CAC, tá certo?",
    ].join("\n\n");
  }
  return `${who}Para direcionar bem rápido: nos últimos anos, você trabalhou ao mesmo tempo em duas ou mais instituições, como hospitais, clínicas, cooperativas ou órgãos públicos?`;
}

type ParsedLeadPayload = {
  parsed_form?: {
    is_doctor?: boolean | null;
    doctor_answer?: string;
  };
};

function doctorAnswerFromLead(lead?: IrLeadRow | null): {
  isDoctor: boolean | null;
  doctorAnswer?: string;
} {
  const payload =
    lead?.raw_payload && typeof lead.raw_payload === "object"
      ? (lead.raw_payload as ParsedLeadPayload)
      : null;
  return {
    isDoctor: payload?.parsed_form?.is_doctor ?? null,
    doctorAnswer: payload?.parsed_form?.doctor_answer,
  };
}

function leadContextForAgent(lead?: IrLeadRow | null): string | null {
  if (!lead) return null;
  const doctor = doctorAnswerFromLead(lead);
  const rows = [
    lead.name ? `Nome do formulário: ${lead.name}.` : null,
    lead.phone ? `Telefone do formulário: ${lead.phone}.` : null,
    lead.email ? `Email do formulário: ${lead.email}.` : null,
    doctor.isDoctor === null
      ? doctor.doctorAnswer
        ? `Resposta sobre ser médico(a): ${doctor.doctorAnswer}.`
        : null
      : `Resposta sobre ser médico(a): ${doctor.isDoctor ? "sim" : "não"}${
          doctor.doctorAnswer ? ` (${doctor.doctorAnswer})` : ""
        }.`,
  ].filter(Boolean);
  if (!rows.length) return null;
  return `Dados do cadastro/formulário do lead: ${rows.join(" ")} Use esses dados como contexto; não peça novamente nome, telefone ou email se já constarem aqui. Se a resposta de médico(a) for "não", explique que o serviço é voltado principalmente para médicos e encaminhe para humano.`;
}

/**
 * Orquestrador IR: opt-out / humano / mídia / qualificação.
 * Sem meeting-scheduler / Calendar.
 */
export async function handleInboundWhatsApp(input: {
  phone: string;
  waId?: string;
  text?: string;
  messageType?: string;
  externalMessageId?: string;
  mediaId?: string;
  mediaFilename?: string;
}): Promise<{ action: string; note: string }> {
  if (
    input.externalMessageId &&
    (await messageExistsByExternalId(input.externalMessageId))
  ) {
    return { action: "duplicate", note: "mensagem já processada" };
  }

  const rawText = (input.text ?? "").trim();
  const text = rawText.toLowerCase();
  const messageType = input.messageType ?? "text";

  const conversation = await findOrCreateConversation({
    phone: input.phone,
    waId: input.waId,
  });

  let lead = conversation?.lead_id
    ? await getLeadById(conversation.lead_id)
    : await findLeadByPhone(input.phone);

  if (conversation && lead && !conversation.lead_id) {
    await setConversationLead(conversation.id, lead.id);
  }

  const extracted = extractGivenName(rawText);
  if (extracted) {
    if (lead && !firstNameFromLead(lead.name)) {
      await updateLeadName(lead.id, extracted);
      lead = { ...lead, name: extracted };
    } else if (!lead) {
      const phoneE164 = normalizePhoneE164(input.phone) ?? input.phone;
      const digits = input.phone.replace(/\D/g, "");
      const created = await insertLead({
        metaLeadgenId: `wa-${digits}`,
        phone: phoneE164,
        name: extracted,
        optInWhatsapp: true,
        source: "whatsapp_inbound",
        rawPayload: { source: "name_capture" },
        status: "conversation_started",
      });
      lead = created ?? (await findLeadByPhone(input.phone));
      if (lead && !firstNameFromLead(lead.name)) {
        await updateLeadName(lead.id, extracted);
        lead = { ...lead, name: extracted };
      }
      if (conversation && lead) {
        await setConversationLead(conversation.id, lead.id);
      }
    }
  }

  const honorific = honorificName(lead?.name) ?? honorificName(extracted);
  const isMedia =
    messageType === "image" ||
    messageType === "document" ||
    messageType === "audio" ||
    messageType === "video";

  let inboundMessageId: string | null = null;
  if (conversation) {
    inboundMessageId = await insertMessage({
      conversationId: conversation.id,
      role: "user",
      text: rawText || input.mediaFilename || `[${messageType}]`,
      messageType,
      externalMessageId: input.externalMessageId,
      deliveryStatus: "received",
    });
    await touchConversation(conversation.id, { lastInbound: true });
  }

  // Qualquer reply cancela drip de templates (janela 24h aberta)
  await cancelDripForPhone(input.phone, "first_reply");

  if (conversation?.status === "waiting_human") {
    if (isOptOut(text)) {
      await cancelDripForPhone(input.phone, "opt_out");
      await suppressPhone({
        phone: input.phone,
        source: "whatsapp_inbound",
        reason: "opt_out_while_human",
        lastMessageText: rawText,
        conversationId: conversation.id,
        leadId: conversation.lead_id,
      });
      await touchConversation(conversation.id, { status: "opt_out" });
      await recordAuditEvent({
        entityType: "conversation",
        entityId: conversation.id,
        eventType: "opt_out_while_human",
        actorType: "webhook",
        summary: "Lead pediu opt-out durante takeover — agente permaneceu silencioso",
      });
      return { action: "opt_out_silent", note: "Opt-out registrado sem resposta automática" };
    }
    if (isMedia && input.mediaId) {
      const stored = await storeInboundDocument({
        conversationId: conversation.id,
        leadId: conversation.lead_id,
        phone: input.phone,
        mediaId: input.mediaId,
        caption: rawText || undefined,
        filename: input.mediaFilename,
        sourceMessageId: inboundMessageId,
        expectedDocumentType: null,
      });
      if (stored) {
        await cancelDocumentReminderForConversation(
          conversation.id,
          "document_received",
        );
        await recordAuditEvent({
          entityType: "conversation",
          entityId: conversation.id,
          eventType: "media_received_while_human",
          actorType: "webhook",
          summary: `${stored.documentType} recebido durante takeover — agente silencioso`,
        });
        return {
          action: "waiting_human_media_stored",
          note: `${stored.documentType} salvo; agente pausado`,
        };
      }
    }
    await recordAuditEvent({
      entityType: "conversation",
      entityId: conversation.id,
      eventType: "inbound_while_human",
      actorType: "webhook",
      summary: "Mensagem recebida com takeover ativo — agente silencioso",
    });
    return { action: "waiting_human", note: "Agente pausado; humano responde" };
  }

  if (isOptOut(text)) {
    await cancelDripForPhone(input.phone, "opt_out");
    if (conversation) {
      await suppressPhone({
        phone: input.phone,
        source: "whatsapp_inbound",
        reason: "opt_out",
        lastMessageText: rawText,
        conversationId: conversation.id,
        leadId: conversation.lead_id,
      });
      await touchConversation(conversation.id, { status: "opt_out" });
      await recordAuditEvent({
        entityType: "conversation",
        entityId: conversation.id,
        eventType: "opt_out",
        actorType: "webhook",
        summary: "Lead pediu para parar",
      });
    }
    const reply =
      "Entendido. Não vou mais enviar mensagens. Se mudar de ideia, é só nos procurar. Até mais.";
    await replyAndPersist(input.phone, conversation?.id, reply);
    return { action: "opt_out", note: "Lead pediu para parar" };
  }

  if (
    conversation?.status === "awaiting_first_reply" &&
    isTemplateAccept(rawText || text)
  ) {
    const first = firstNameFromLead(lead?.name) ?? extracted;
    const doctor = doctorAnswerFromLead(lead);
    if (doctor.isDoctor === false) {
      const who = honorificName(first) ?? honorific;
      const reply = who
        ? `Obrigado, ${who}. Vi aqui que no cadastro consta que você não é médico(a). A análise da IR é voltada principalmente para médicos, então vou encaminhar para um atendente humano conferir e te orientar corretamente.`
        : "Obrigado. Vi aqui que no cadastro consta que você não é médico(a). A análise da IR é voltada principalmente para médicos, então vou encaminhar para um atendente humano conferir e te orientar corretamente.";
      await replyAndPersist(input.phone, conversation.id, reply);
      await touchConversation(conversation.id, { status: "waiting_human" });
      await recordAuditEvent({
        entityType: "conversation",
        entityId: conversation.id,
        eventType: "non_doctor_lead_handoff",
        actorType: "webhook",
        summary: "Cadastro indicou não médico(a); encaminhado para humano",
      });
      return { action: "non_doctor_handoff", note: "Lead não médico encaminhado" };
    }
    const briefing =
      (await generateFirstContactReply({
        userText: rawText || "Sim",
        firstName: first,
        leadContext: leadContextForAgent(lead),
      })) ?? renderPostTemplateBriefing(first);
    await replyAndPersist(input.phone, conversation.id, briefing);
    await touchConversation(conversation.id, { status: "qualifying" });
    await recordAuditEvent({
      entityType: "conversation",
      entityId: conversation.id,
      eventType: "post_template_briefing",
      actorType: "webhook",
      summary: "Abertura explicativa curta após aceite do template",
    });
    console.info("[orchestrator] post-template briefing", {
      phone: input.phone,
    });
    return { action: "post_template_briefing", note: "abertura_explicativa" };
  }

  if (wantsHuman(text)) {
    if (conversation) {
      await touchConversation(conversation.id, { status: "waiting_human" });
      await recordAuditEvent({
        entityType: "conversation",
        entityId: conversation.id,
        eventType: "human_review_requested",
        actorType: "webhook",
      });
    }
    const reply =
      "Claro. Vou encaminhar para um atendente humano da IR Consultoria. Em breve alguém da equipe retorna por aqui.";
    await replyAndPersist(input.phone, conversation?.id, reply);
    return { action: "human_review", note: "Pedido de humano" };
  }

  if (isMedia && input.mediaId && conversation) {
    const stored = await storeInboundDocument({
      conversationId: conversation.id,
      leadId: conversation.lead_id,
      phone: input.phone,
      mediaId: input.mediaId,
      caption: rawText || undefined,
      filename: input.mediaFilename,
      sourceMessageId: inboundMessageId,
      expectedDocumentType: null,
    });

    if (stored) {
      await cancelDocumentReminderForConversation(
        conversation.id,
        "document_received",
      );
      await touchConversation(conversation.id, {
        status: stored.complete ? "waiting_human" : "waiting_documents",
      });
      await replyAndPersist(
        input.phone,
        conversation.id,
        documentAckMessage(stored),
      );
      return {
        action: stored.complete ? "documents_complete" : "document_stored",
        note: `${stored.documentType} salvo; faltam ${stored.missing.length}`,
      };
    }

    console.warn("[orchestrator] media not stored", input.mediaId);
  }

  let reply: string | null = null;

  if (isOpenAiConfigured() && (rawText || isMedia)) {
    const history = conversation
      ? await listRecentMessages(conversation.id, 8)
      : [];
    const briefingDone = history.some(
      (m) =>
        m.role === "assistant" &&
        /restitui[cç][aã]o/i.test(m.text ?? ""),
    );
    reply = await generateAgentReply({
      userText: rawText || `Lead enviou ${messageType}`,
      history,
      honorific,
      needsName: !honorific,
      briefingDone,
      leadContext: leadContextForAgent(lead),
    });
  }

  if (!reply) {
    reply = fallbackReply(
      isMedia ? "media" : text.includes("doc") || text.includes("envi")
        ? "document"
        : "qualify",
      honorific,
    );
  }

  if (conversation) {
    await touchConversation(conversation.id, {
      status:
        conversation.status === "awaiting_first_reply"
          ? "awaiting_first_reply"
          : "qualifying",
    });
  }

  await replyAndPersist(input.phone, conversation?.id, reply);

  console.info("[orchestrator] replied", {
    phone: input.phone,
    messageType,
    openai: isOpenAiConfigured(),
    preview: reply.slice(0, 80),
  });

  return {
    action: isMedia ? "document_ack" : "qualify",
    note: isOpenAiConfigured() ? "reply_openai" : "reply_fallback",
  };
}

async function replyAndPersist(
  phone: string,
  conversationId: string | undefined,
  text: string,
): Promise<void> {
  const sent = await sendWhatsAppText({ toE164: phone, text });
  if (!sent.ok) {
    console.error("[orchestrator] send failed", sent.error);
    return;
  }

  if (conversationId) {
    await insertMessage({
      conversationId,
      role: "assistant",
      text,
      messageType: "text",
      externalMessageId: sent.externalMessageId,
      deliveryStatus: "sent",
    });
    await touchConversation(conversationId, { lastOutbound: true });
  }

  await sendCnisGuideIfNeeded({
    phone,
    conversationId,
    replyText: text,
  });
}
