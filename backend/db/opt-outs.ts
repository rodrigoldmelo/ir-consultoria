import { recordAuditEvent } from "./audit.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import {
  normalizePhoneDigits,
  normalizePhoneE164,
  phoneLookupCandidates,
} from "../services/phone.js";

function phoneCandidates(phone: string): string[] {
  return [...new Set(phoneLookupCandidates(phone).map(normalizePhoneDigits).filter(Boolean))];
}

export async function isPhoneOptedOut(phone: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;

  const candidates = phoneCandidates(phone);
  if (!candidates.length) return false;

  const { data, error } = await db
    .from("ir_opt_out_numbers")
    .select("id")
    .in("normalized_phone", candidates)
    .limit(1);

  if (error) {
    console.error("[db/opt-outs] isPhoneOptedOut", error.message);
    return false;
  }

  return Boolean(data?.length);
}

export async function suppressPhone(input: {
  phone: string;
  source: string;
  reason?: string;
  lastMessageText?: string | null;
  conversationId?: string | null;
  leadId?: string | null;
}): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const phone = normalizePhoneE164(input.phone) ?? input.phone;
  const normalizedPhone = normalizePhoneDigits(phone);
  if (!normalizedPhone) return;

  const now = new Date().toISOString();
  const { error } = await db.from("ir_opt_out_numbers").upsert(
    {
      phone,
      normalized_phone: normalizedPhone,
      source: input.source,
      reason: input.reason ?? "opt_out",
      last_message_text: input.lastMessageText ?? null,
      conversation_id: input.conversationId ?? null,
      lead_id: input.leadId ?? null,
      updated_at: now,
    },
    { onConflict: "normalized_phone" },
  );

  if (error) {
    console.error("[db/opt-outs] suppressPhone", error.message);
    return;
  }

  const candidates = phoneLookupCandidates(phone);
  const { error: leadError } = await db
    .from("ir_leads")
    .update({
      status: "opt_out",
      opt_in_whatsapp: false,
      updated_at: now,
    })
    .in("phone", candidates);

  if (leadError) {
    console.error("[db/opt-outs] mark leads opt_out", leadError.message);
  }

  await recordAuditEvent({
    entityType: "phone",
    entityId: normalizedPhone,
    eventType: "phone_opt_out_suppressed",
    actorType: "webhook",
    summary: "Telefone incluído na lista global de supressão de disparos",
    metadata: {
      phone,
      source: input.source,
      reason: input.reason ?? "opt_out",
      conversationId: input.conversationId ?? null,
      leadId: input.leadId ?? null,
    },
  });
}
