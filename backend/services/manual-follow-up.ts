import {
  getConversationById,
  insertMessage,
  touchConversation,
} from "../db/conversations.js";
import { findLeadByPhone, getLeadById } from "../db/leads.js";
import { isPhoneOptedOut } from "../db/opt-outs.js";
import { config } from "../config.js";
import { sendWhatsAppTemplate } from "./meta-graph.js";
import { normalizePhoneE164 } from "./phone.js";
import { firstNameFromLead } from "./post-template-briefing.js";
import { renderTemplateBody } from "./template-copy.js";

export type ManualFollowUpType =
  | "cnis_reminder"
  | "continue_analysis"
  | "resume_analysis";

function templateForFollowUp(type: ManualFollowUpType): string {
  if (type === "cnis_reminder") return config.meta.templateCnisReminder;
  if (type === "continue_analysis") return config.meta.templateContinueAnalysis;
  return config.meta.templateResumeAnalysis;
}

function missingTemplateError(type: ManualFollowUpType): string {
  if (type === "cnis_reminder") return "missing_IR_WHATSAPP_TEMPLATE_CNIS_REMINDER";
  if (type === "continue_analysis") {
    return "missing_IR_WHATSAPP_TEMPLATE_CONTINUE_ANALYSIS";
  }
  return "missing_IR_WHATSAPP_TEMPLATE_RESUME_ANALYSIS";
}

export async function sendManualFollowUp(input: {
  conversationId: string;
  type: ManualFollowUpType;
}): Promise<
  | {
      ok: true;
      phone: string;
      templateName: string;
      externalMessageId: string;
    }
  | { ok: false; error: string }
> {
  const templateName = templateForFollowUp(input.type);
  if (!templateName) {
    return { ok: false, error: missingTemplateError(input.type) };
  }

  const conversation = await getConversationById(input.conversationId);
  if (!conversation) {
    return { ok: false, error: "conversation_not_found" };
  }

  const phone = normalizePhoneE164(conversation.phone);
  if (!phone) {
    return { ok: false, error: "invalid_phone" };
  }
  if (await isPhoneOptedOut(phone)) {
    return { ok: false, error: "phone_suppressed_opt_out" };
  }

  const lead = conversation.lead_id
    ? await getLeadById(conversation.lead_id)
    : await findLeadByPhone(phone);
  const first = firstNameFromLead(lead?.name) ?? "Doutor(a)";
  const result = await sendWhatsAppTemplate({
    toE164: phone,
    templateName,
    languageCode: config.meta.templateLanguage,
    bodyParameters: [first],
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await insertMessage({
    conversationId: conversation.id,
    role: "assistant",
    text: renderTemplateBody(templateName, [first]),
    messageType: "template",
    externalMessageId: result.externalMessageId,
    deliveryStatus: "sent",
  });
  await touchConversation(conversation.id, {
    status:
      input.type === "cnis_reminder" &&
      !["documents_partial", "documents_complete"].includes(conversation.status)
        ? "waiting_documents"
        : conversation.status,
    lastOutbound: true,
    templateName,
    templateStatus: `manual_${input.type}`,
  });

  return {
    ok: true,
    phone,
    templateName,
    externalMessageId: result.externalMessageId,
  };
}
