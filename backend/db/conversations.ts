import { getSupabaseAdmin } from "../services/supabase.js";
import type { ConversationStatus } from "../types/index.js";

export type IrConversationRow = {
  id: string;
  lead_id: string | null;
  phone: string;
  whatsapp_wa_id: string | null;
  status: ConversationStatus;
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
};

function normalizePhoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function findOrCreateConversation(input: {
  phone: string;
  waId?: string;
  status?: ConversationStatus;
}): Promise<IrConversationRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const digits = normalizePhoneKey(input.phone);

  const { data: existing, error: findErr } = await db
    .from("ir_conversations")
    .select("*")
    .eq("phone", digits)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("[db/conversations] find", findErr.message);
  }

  if (existing) {
    return existing as IrConversationRow;
  }

  const isOutreach = input.status === "awaiting_first_reply";
  const { data, error } = await db
    .from("ir_conversations")
    .insert({
      phone: digits,
      whatsapp_wa_id: input.waId ?? digits,
      status: input.status ?? "in_service",
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
    return conversations.map((row) => ({
      ...row,
      last_message_text: null,
      last_message_at: null,
    }));
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

  return conversations.map((row) => {
    const last = byConversation.get(row.id);
    return {
      ...row,
      last_message_text: last?.text ?? (last ? `[${last.message_type ?? "mídia"}]` : null),
      last_message_at: last?.created_at ?? null,
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
    created_at: string;
  }>
> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from("ir_messages")
    .select("id, role, text, message_type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[db/conversations] listMessagesForPanel", error.message);
    return [];
  }
  return data ?? [];
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
