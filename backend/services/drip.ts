import { getSupabaseAdmin } from "./supabase.js";
import { config } from "../config.js";

export type DripStep = 2 | 3;

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
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
  await db
    .from("ir_template_drip_jobs")
    .update({
      status: "cancelled",
      cancel_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("phone", digits)
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
