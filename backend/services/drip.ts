import { getSupabaseAdmin } from "./supabase.js";
import { config } from "../config.js";

export type DripStep = 2 | 3;
const DOCUMENT_REMINDER_STEP = 10;

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

function tomorrowMorningIso(): string {
  const hour = Number(process.env.IR_DOCUMENT_REMINDER_HOUR || 8);
  const minute = Number(process.env.IR_DOCUMENT_REMINDER_MINUTE || 30);
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 8;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 30;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, number>>((acc, part) => {
      if (part.type === "year" || part.type === "month" || part.type === "day") {
        acc[part.type] = Number(part.value);
      }
      return acc;
    }, {});

  const now = new Date();

  // Sao Paulo does not currently observe DST; keep this deterministic for the VPS.
  return new Date(
    Date.UTC(
      parts.year ?? now.getUTCFullYear(),
      (parts.month ?? 1) - 1,
      (parts.day ?? 1) + 1,
      safeHour + 3,
      safeMinute,
      0,
      0,
    ),
  ).toISOString();
}

/** Agenda steps 2 e 3 após o template inicial (step 1 já foi o boas-vindas). */
export async function scheduleDripAfterInitialTemplate(input: {
  leadId?: string;
  conversationId?: string;
  phone: string;
}): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const trust = process.env.IR_WHATSAPP_TEMPLATE_TRUST?.trim();
  const explain = process.env.IR_WHATSAPP_TEMPLATE_EXPLAIN?.trim();
  const step2h = Number(process.env.IR_DRIP_STEP2_HOURS || 24);
  const step3h = Number(process.env.IR_DRIP_STEP3_HOURS || 120);

  const jobs: Array<{
    lead_id: string | null;
    conversation_id: string | null;
    phone: string;
    template_name: string;
    template_language: string;
    step: number;
    status: string;
    scheduled_at: string;
  }> = [];

  if (trust) {
    jobs.push({
      lead_id: input.leadId ?? null,
      conversation_id: input.conversationId ?? null,
      phone: input.phone.replace(/\D/g, ""),
      template_name: trust,
      template_language: config.meta.templateLanguage,
      step: 2,
      status: "scheduled",
      scheduled_at: hoursFromNow(step2h),
    });
  }
  if (explain) {
    jobs.push({
      lead_id: input.leadId ?? null,
      conversation_id: input.conversationId ?? null,
      phone: input.phone.replace(/\D/g, ""),
      template_name: explain,
      template_language: config.meta.templateLanguage,
      step: 3,
      status: "scheduled",
      scheduled_at: hoursFromNow(step3h),
    });
  }

  if (!jobs.length) {
    console.info("[drip] skip schedule — set IR_WHATSAPP_TEMPLATE_TRUST/EXPLAIN");
    return;
  }

  const { error } = await db.from("ir_template_drip_jobs").insert(jobs);
  if (error) {
    console.error("[drip] schedule", error.message);
  } else {
    console.info("[drip] scheduled", jobs.length, "jobs for", input.phone);
  }
}

export async function cancelDripForPhone(
  phone: string,
  reason: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  const digits = phone.replace(/\D/g, "");
  const query = db
    .from("ir_template_drip_jobs")
    .update({
      status: "cancelled",
      cancel_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("phone", digits)
    .eq("status", "scheduled");

  if (reason === "first_reply") {
    await query.in("step", [2, 3]);
  } else {
    await query;
  }
}

export async function scheduleDocumentReminder(input: {
  conversationId: string;
  leadId?: string | null;
  phone: string;
}): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  if (!config.meta.templateCnisReminder) return;

  const phone = input.phone.replace(/\D/g, "");
  const { data: existing, error: existingError } = await db
    .from("ir_template_drip_jobs")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .eq("step", DOCUMENT_REMINDER_STEP)
    .eq("status", "scheduled")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("[drip] document reminder lookup", existingError.message);
    return;
  }
  if (existing) return;

  const { error } = await db.from("ir_template_drip_jobs").insert({
    lead_id: input.leadId ?? null,
    conversation_id: input.conversationId,
    phone,
    template_name: config.meta.templateCnisReminder,
    template_language: config.meta.templateLanguage,
    step: DOCUMENT_REMINDER_STEP,
    status: "scheduled",
    scheduled_at: tomorrowMorningIso(),
  });

  if (error) {
    console.error("[drip] schedule document reminder", error.message);
  } else {
    console.info("[drip] scheduled document reminder", input.phone);
  }
}

export async function schedulePendingDocumentReminders(limit = 100): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  if (!config.meta.templateCnisReminder) return;

  const { data: guideMessages, error: guideError } = await db
    .from("ir_messages")
    .select("conversation_id")
    .eq("message_type", "cnis_guide")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (guideError) {
    console.error("[drip] pending document reminders lookup", guideError.message);
    return;
  }

  const conversationIds = [
    ...new Set(
      (guideMessages ?? [])
        .map((row) =>
          typeof row.conversation_id === "string" ? row.conversation_id : "",
        )
        .filter(Boolean),
    ),
  ];
  if (!conversationIds.length) return;

  const { data: conversations, error: conversationError } = await db
    .from("ir_conversations")
    .select("id, lead_id, phone, status")
    .in("id", conversationIds)
    .in("status", ["qualifying", "waiting_documents", "documents_partial"]);

  if (conversationError) {
    console.error("[drip] pending document reminders conversations", conversationError.message);
    return;
  }

  const { data: documents, error: documentsError } = await db
    .from("ir_documents")
    .select("conversation_id, document_type")
    .in("conversation_id", conversationIds)
    .in("document_type", ["cnis", "dirf_income"]);

  if (documentsError) {
    console.error("[drip] pending document reminders documents", documentsError.message);
    return;
  }

  const conversationsWithDocuments = new Set(
    (documents ?? [])
      .map((row) =>
        typeof row.conversation_id === "string" ? row.conversation_id : "",
      )
      .filter(Boolean),
  );

  for (const conversation of conversations ?? []) {
    const id = typeof conversation.id === "string" ? conversation.id : "";
    const phone = typeof conversation.phone === "string" ? conversation.phone : "";
    if (!id || !phone || conversationsWithDocuments.has(id)) continue;
    await scheduleDocumentReminder({
      conversationId: id,
      leadId:
        typeof conversation.lead_id === "string" ? conversation.lead_id : null,
      phone,
    });
  }
}

export async function cancelDocumentReminderForConversation(
  conversationId: string,
  reason: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  await db
    .from("ir_template_drip_jobs")
    .update({
      status: "cancelled",
      cancel_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("conversation_id", conversationId)
    .eq("step", DOCUMENT_REMINDER_STEP)
    .eq("status", "scheduled");
}

export async function listDueDripJobs(limit = 20) {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("ir_template_drip_jobs")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[drip] listDue", error.message);
    return [];
  }
  return data ?? [];
}

export async function markDripJob(
  id: string,
  patch: {
    status: string;
    externalMessageId?: string;
    errorMessage?: string;
    cancelReason?: string;
  },
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  await db
    .from("ir_template_drip_jobs")
    .update({
      status: patch.status,
      external_message_id: patch.externalMessageId ?? null,
      error_message: patch.errorMessage ?? null,
      cancel_reason: patch.cancelReason ?? null,
      sent_at: patch.status === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}
