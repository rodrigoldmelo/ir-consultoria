import { getSupabaseAdmin } from "../services/supabase.js";
import { normalizePhoneDigits, phoneLookupCandidates } from "../services/phone.js";
import type { ConversationStatus } from "../types/index.js";

export type IrConversationRow = {
  id: string;
  lead_id: string | null;
  phone: string;
  whatsapp_wa_id: string | null;
  status: ConversationStatus;
  source?: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  template_status: string | null;
  template_name: string | null;
  created_at: string;
  updated_at: string;
};

export type IrConversationPanelRow = IrConversationRow & {
  last_message_text: string | null;
  last_message_at: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_source: string | null;
  lead_form_id: string | null;
  lead_meta_id: string | null;
  lead_is_doctor: boolean | null;
  lead_doctor_answer: string | null;
  source: string | null;
};

type ParsedLeadPayload = {
  parsed_form?: {
    is_doctor?: boolean | null;
    doctor_answer?: string | null;
  };
};

type LeadPanelInfo = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  form_id: string | null;
  meta_leadgen_id: string | null;
  is_doctor: boolean | null;
  doctor_answer: string | null;
};

function leadPanelInfoFromRow(lead: Record<string, unknown>): LeadPanelInfo {
  const payload =
    lead.raw_payload && typeof lead.raw_payload === "object"
      ? (lead.raw_payload as ParsedLeadPayload)
      : {};
  const parsed = payload.parsed_form ?? {};

  return {
    id: String(lead.id),
    name: (lead.name as string | null) ?? null,
    phone: (lead.phone as string | null) ?? null,
    email: (lead.email as string | null) ?? null,
    source: (lead.source as string | null) ?? null,
    form_id: (lead.form_id as string | null) ?? null,
    meta_leadgen_id: (lead.meta_leadgen_id as string | null) ?? null,
    is_doctor:
      typeof parsed.is_doctor === "boolean" ? parsed.is_doctor : null,
    doctor_answer:
      typeof parsed.doctor_answer === "string" ? parsed.doctor_answer : null,
  };
}

function normalizePhoneKey(phone: string): string {
  return normalizePhoneDigits(phone);
}

function conversationMatchScore(row: IrConversationRow): number {
  let score = 0;
  if (row.lead_id) score += 8;
  if (row.source === "meta" || row.source === "meta_lead_ads") score += 4;
  if (row.template_status === "sent") score += 2;
  if (row.status === "awaiting_first_reply") score += 1;
  return score;
}

export async function findOrCreateConversation(input: {
  phone: string;
  waId?: string;
  status?: ConversationStatus;
  leadId?: string;
  source?: string;
}): Promise<IrConversationRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const digits = normalizePhoneKey(input.phone);
  const candidates = phoneLookupCandidates(input.phone);

  const { data: existingRows, error: findErr } = await db
    .from("ir_conversations")
    .select("*")
    .in("phone", candidates)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (findErr) {
    console.error("[db/conversations] find", findErr.message);
  }

  const existing = ((existingRows ?? []) as IrConversationRow[]).sort((a, b) => {
    const score = conversationMatchScore(b) - conversationMatchScore(a);
    if (score !== 0) return score;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  })[0];

  if (existing) {
    const row = existing;
    const patch: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (input.leadId && !row.lead_id) patch.lead_id = input.leadId;
    if (input.source) patch.source = input.source;
    if (Object.keys(patch).length > 1) {
      const { error: linkErr } = await db
        .from("ir_conversations")
        .update(patch)
        .eq("id", row.id);
      if (linkErr) {
        console.error("[db/conversations] link existing", linkErr.message);
      } else {
        return { ...row, ...patch } as IrConversationRow;
      }
    }
    return row;
  }

  const isOutreach = input.status === "awaiting_first_reply";
  const { data, error } = await db
    .from("ir_conversations")
    .insert({
      phone: digits,
      whatsapp_wa_id: input.waId ?? digits,
      status: input.status ?? "in_service",
      lead_id: input.leadId ?? null,
      source: input.source ?? "live",
      last_inbound_at: isOutreach ? null : new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[db/conversations] insert", error.message);
    throw error;
  }

  return data as IrConversationRow;
}

export async function hasTemplateSentForPhone(phone: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;

  const { data, error } = await db
    .from("ir_conversations")
    .select("id")
    .eq("phone", normalizePhoneKey(phone))
    .eq("template_status", "sent")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[db/conversations] hasTemplateSentForPhone", error.message);
    return false;
  }
  return Boolean(data);
}

export async function touchConversation(
  conversationId: string,
  patch: {
    status?: ConversationStatus;
    lastInbound?: boolean;
    lastOutbound?: boolean;
    clearInbound?: boolean;
    templateName?: string;
    templateStatus?: string;
  },
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const updates: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status) updates.status = patch.status;
  if (patch.clearInbound) updates.last_inbound_at = null;
  if (patch.lastInbound) updates.last_inbound_at = new Date().toISOString();
  if (patch.lastOutbound) updates.last_outbound_at = new Date().toISOString();
  if (patch.templateName) {
    updates.template_name = patch.templateName;
    updates.template_sent_at = new Date().toISOString();
  }
  if (patch.templateStatus) updates.template_status = patch.templateStatus;

  const { error } = await db
    .from("ir_conversations")
    .update(updates)
    .eq("id", conversationId);

  if (error) {
    console.error("[db/conversations] touch", error.message);
  }
}

export async function insertMessage(input: {
  conversationId: string;
  role: "user" | "assistant" | "human" | "system";
  text?: string;
  messageType?: string;
  externalMessageId?: string;
  deliveryStatus?: string;
}): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("ir_messages")
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      text: input.text ?? null,
      message_type: input.messageType ?? "text",
      external_message_id: input.externalMessageId ?? null,
      delivery_status: input.deliveryStatus ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[db/conversations] insertMessage", error.message);
    throw error;
  }

  return data?.id ?? null;
}

export async function listRecentMessages(
  conversationId: string,
  limit = 12,
): Promise<Array<{ role: string; text: string | null }>> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from("ir_messages")
    .select("role, text")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[db/conversations] listRecentMessages", error.message);
    return [];
  }

  return (data ?? []).reverse();
}

export async function getConversationById(
  id: string,
): Promise<IrConversationRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("ir_conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[db/conversations] getById", error.message);
    return null;
  }
  return (data as IrConversationRow) ?? null;
}

export async function setConversationLead(
  conversationId: string,
  leadId: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  const { error } = await db
    .from("ir_conversations")
    .update({ lead_id: leadId, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) {
    console.error("[db/conversations] setConversationLead", error.message);
  }
}

export async function messageExistsByExternalId(
  externalMessageId: string,
): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db || !externalMessageId) return false;
  const { data, error } = await db
    .from("ir_messages")
    .select("id")
    .eq("external_message_id", externalMessageId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[db/conversations] messageExistsByExternalId", error.message);
    return false;
  }
  return Boolean(data);
}

export async function listConversations(limit = 80): Promise<IrConversationPanelRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from("ir_conversations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[db/conversations] list", error.message);
    return [];
  }
  const conversations = (data ?? []) as IrConversationRow[];
  const ids = conversations.map((row) => row.id);
  if (!ids.length) return [];

  const { data: messages, error: messagesError } = await db
    .from("ir_messages")
    .select("conversation_id, text, message_type, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false })
    .limit(ids.length * 6);

  if (messagesError) {
    console.error("[db/conversations] list last messages", messagesError.message);
  }

  const byConversation = new Map<
    string,
    { text: string | null; message_type: string | null; created_at: string }
  >();
  for (const message of messages ?? []) {
    const conversationId = String(message.conversation_id);
    if (!byConversation.has(conversationId)) {
      byConversation.set(conversationId, {
        text: message.text ?? null,
        message_type: message.message_type ?? null,
        created_at: message.created_at,
      });
    }
  }

  const leadIds = [
    ...new Set(
      conversations
        .map((row) => row.lead_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const phones = [
    ...new Set(
      conversations
        .flatMap((row) => phoneLookupCandidates(row.phone))
        .filter(Boolean),
    ),
  ];

  const leadSelect =
    "id, meta_leadgen_id, name, phone, email, source, form_id, raw_payload";
  const leadsById = new Map<string, LeadPanelInfo>();
  const leadsByPhone = new Map<string, LeadPanelInfo>();

  if (leadIds.length) {
    const { data: leads, error: leadsError } = await db
      .from("ir_leads")
      .select(leadSelect)
      .in("id", leadIds);
    if (leadsError) {
      console.error("[db/conversations] list leads by id", leadsError.message);
    } else {
      for (const lead of leads ?? []) {
        const info = leadPanelInfoFromRow(lead);
        leadsById.set(info.id, info);
      }
    }
  }

  if (phones.length) {
    const { data: leads, error: leadsError } = await db
      .from("ir_leads")
      .select(leadSelect)
      .in("phone", phones);
    if (leadsError) {
      console.error("[db/conversations] list leads by phone", leadsError.message);
    } else {
      for (const lead of leads ?? []) {
        const info = leadPanelInfoFromRow(lead);
        if (!leadsById.has(info.id)) {
          leadsById.set(info.id, info);
        }
        const phoneKey = normalizePhoneKey(String(lead.phone ?? ""));
        if (phoneKey && !leadsByPhone.has(phoneKey)) {
          leadsByPhone.set(phoneKey, info);
        }
        for (const candidate of phoneLookupCandidates(String(lead.phone ?? ""))) {
          const candidateKey = normalizePhoneKey(candidate);
          if (candidateKey && !leadsByPhone.has(candidateKey)) {
            leadsByPhone.set(candidateKey, info);
          }
        }
      }
    }
  }

  return conversations.map((row) => {
    const last = byConversation.get(row.id);
    const linked = row.lead_id ? leadsById.get(row.lead_id) : undefined;
    const byPhone = leadsByPhone.get(normalizePhoneKey(row.phone));
    const lead = linked ?? byPhone;
    const conversationSource =
      ((row as IrConversationRow & { source?: string | null }).source ?? null) ||
      null;
    return {
      ...row,
      source: conversationSource,
      last_message_text: last?.text ?? (last ? `[${last.message_type ?? "mídia"}]` : null),
      last_message_at: last?.created_at ?? null,
      lead_name: lead?.name ?? null,
      lead_phone: lead?.phone ?? null,
      lead_email: lead?.email ?? null,
      lead_source: lead?.source ?? null,
      lead_form_id: lead?.form_id ?? null,
      lead_meta_id: lead?.meta_leadgen_id ?? null,
      lead_is_doctor: lead?.is_doctor ?? null,
      lead_doctor_answer: lead?.doctor_answer ?? null,
    };
  });
}

export async function listMessagesForPanel(
  conversationId: string,
  limit = 100,
): Promise<
  Array<{
    id: string;
    role: string;
    text: string | null;
    message_type: string | null;
    external_message_id: string | null;
    delivery_status: string | null;
    media_document_id?: string | null;
    media_filename?: string | null;
    media_mime_type?: string | null;
    media_size_bytes?: number | null;
    created_at: string;
  }>
> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from("ir_messages")
    .select("id, role, text, message_type, external_message_id, delivery_status, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[db/conversations] listMessagesForPanel", error.message);
    return [];
  }
  const rows = data ?? [];
  const { data: documents, error: documentsError } = await db
    .from("ir_documents")
    .select("id, source_message_id, original_filename, mime_type, size_bytes, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (documentsError) {
    console.error("[db/conversations] list message media", documentsError.message);
    return rows;
  }

  const docsByMessage = new Map<string, Record<string, unknown>>();
  const unlinkedDocs: Array<Record<string, unknown>> = [];
  for (const doc of documents ?? []) {
    const sourceMessageId =
      typeof doc.source_message_id === "string" ? doc.source_message_id : "";
    if (sourceMessageId) {
      docsByMessage.set(sourceMessageId, doc);
    } else {
      unlinkedDocs.push(doc);
    }
  }

  let fallbackDocIndex = 0;
  return rows.map((message) => {
    const isMedia = ["image", "audio", "video", "document"].includes(
      String(message.message_type ?? ""),
    );
    const doc =
      docsByMessage.get(String(message.id)) ??
      (isMedia && message.role === "user"
        ? unlinkedDocs[fallbackDocIndex++]
        : undefined);
    if (!doc) return message;
    return {
      ...message,
      media_document_id: String(doc.id),
      media_filename:
        typeof doc.original_filename === "string" ? doc.original_filename : null,
      media_mime_type: typeof doc.mime_type === "string" ? doc.mime_type : null,
      media_size_bytes: doc.size_bytes ? Number(doc.size_bytes) : null,
    };
  });
}

export async function getMessageForConversation(
  conversationId: string,
  messageId: string,
): Promise<{
  id: string;
  role: string;
  text: string | null;
  external_message_id: string | null;
} | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("ir_messages")
    .select("id, role, text, external_message_id")
    .eq("conversation_id", conversationId)
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    console.error("[db/conversations] getMessageForConversation", error.message);
    return null;
  }
  return data ?? null;
}

export async function deleteMessageForPanel(
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;

  const { error } = await db
    .from("ir_messages")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("id", messageId)
    .neq("role", "user");

  if (error) {
    console.error("[db/conversations] deleteMessageForPanel", error.message);
    return false;
  }
  return true;
}

const NUDGE_STATUSES = ["qualifying", "waiting_documents", "in_service"];

/** Conversas na janela 24h em que o agente falou por último e o lead sumiu. */
export async function listConversationsDueForInWindowNudge(input: {
  minQuietHours: number;
  windowHours: number;
  limit?: number;
}): Promise<IrConversationRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const now = Date.now();
  const inboundAfter = new Date(now - input.windowHours * 3600_000).toISOString();
  const outboundBefore = new Date(now - input.minQuietHours * 3600_000).toISOString();

  const { data, error } = await db
    .from("ir_conversations")
    .select("*")
    .in("status", NUDGE_STATUSES)
    .not("last_inbound_at", "is", null)
    .gte("last_inbound_at", inboundAfter)
    .not("last_outbound_at", "is", null)
    .lte("last_outbound_at", outboundBefore)
    .limit(input.limit ?? 10);

  if (error) {
    console.error("[db/conversations] inWindowNudge", error.message);
    return [];
  }

  return ((data ?? []) as IrConversationRow[]).filter((row) => {
    if (!row.last_inbound_at || !row.last_outbound_at) return false;
    return row.last_outbound_at > row.last_inbound_at;
  });
}

export async function conversationHasNudgeSince(
  conversationId: string,
  sinceIso: string,
): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return true;

  const { data, error } = await db
    .from("ir_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("message_type", "nudge")
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[db/conversations] hasNudge", error.message);
    return true;
  }
  return Boolean(data);
}

export async function conversationHasMessageType(
  conversationId: string,
  messageType: string,
): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return true;
  const { data, error } = await db
    .from("ir_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("message_type", messageType)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[db/conversations] hasMessageType", error.message);
    return true;
  }
  return Boolean(data);
}
