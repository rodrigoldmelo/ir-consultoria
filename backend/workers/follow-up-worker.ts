/**
 * Worker de drip — templates #2/#3 para leads sem 1ª resposta.
 * Ativar: IR_FOLLOW_UP_WORKER_ENABLED=true + templates TRUST/EXPLAIN no env.
 */
import { config } from "../config.js";
import {
  getConversationById,
  insertMessage,
  touchConversation,
} from "../db/conversations.js";
import { getLeadById } from "../db/leads.js";
import { isPhoneOptedOut } from "../db/opt-outs.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import {
  listDueDripJobs,
  markDripJob,
  schedulePendingDocumentReminders,
} from "../services/drip.js";
import { sendWhatsAppTemplate } from "../services/meta-graph.js";
import { firstNameFromLead } from "../services/post-template-briefing.js";
import { renderTemplateBody } from "../services/template-copy.js";

let timer: ReturnType<typeof setInterval> | null = null;
const DOCUMENT_REMINDER_STEP = 10;

async function leadAlreadyReplied(phone: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const digits = phone.replace(/\D/g, "");
  const { data } = await db
    .from("ir_conversations")
    .select("id, last_inbound_at, status")
    .eq("phone", digits)
    .maybeSingle();
  if (!data) return false;
  if (data.status === "opt_out" || data.status === "closed") return true;
  return Boolean(data.last_inbound_at);
}

async function shouldSendDocumentReminder(job: Record<string, unknown>): Promise<boolean> {
  const conversationId =
    typeof job.conversation_id === "string" ? job.conversation_id : null;
  if (!conversationId) return false;

  const conversation = await getConversationById(conversationId);
  if (!conversation) return false;
  if (!["qualifying", "waiting_documents"].includes(conversation.status)) return false;
  if (await isPhoneOptedOut(conversation.phone)) return false;

  const db = getSupabaseAdmin();
  if (!db) return false;
  const { data, error } = await db
    .from("ir_documents")
    .select("id, document_type")
    .eq("conversation_id", conversationId)
    .in("document_type", ["cnis", "dirf_income"])
    .limit(1);

  if (error) {
    console.error("[follow-up-worker] document reminder check", error.message);
    return false;
  }

  return !data?.length;
}

async function tick(): Promise<void> {
  const jobs = await listDueDripJobs(10);
  if (!jobs.length) return;

  for (const job of jobs) {
    const phone = String(job.phone);
    const step = Number(job.step);
    if (step === DOCUMENT_REMINDER_STEP) {
      if (!(await shouldSendDocumentReminder(job))) {
        await markDripJob(job.id, {
          status: "cancelled",
          cancelReason: "documents_present_or_not_waiting",
        });
        continue;
      }
    } else if (await leadAlreadyReplied(phone)) {
      await markDripJob(job.id, {
        status: "cancelled",
        cancelReason: "replied_or_closed",
      });
      continue;
    }
    if (await isPhoneOptedOut(phone)) {
      await markDripJob(job.id, {
        status: "cancelled",
        cancelReason: "opt_out",
      });
      continue;
    }

    let firstName = "olá";
    let leadId = typeof job.lead_id === "string" ? job.lead_id : null;
    if (!leadId && typeof job.conversation_id === "string") {
      const conversation = await getConversationById(job.conversation_id);
      leadId = conversation?.lead_id ?? null;
    }
    if (leadId) {
      const lead = await getLeadById(leadId);
      firstName = firstNameFromLead(lead?.name) ?? "olá";
    }

    const result = await sendWhatsAppTemplate({
      toE164: phone,
      templateName: String(job.template_name),
      languageCode: String(job.template_language || "pt_BR"),
      bodyParameters: [firstName],
    });

    if (!result.ok) {
      await markDripJob(job.id, {
        status: "failed",
        errorMessage: result.error,
      });
      console.error("[follow-up-worker] send failed", job.id, result.error);
      continue;
    }

    await markDripJob(job.id, {
      status: "sent",
      externalMessageId: result.externalMessageId,
    });

    if (job.conversation_id) {
      await insertMessage({
        conversationId: String(job.conversation_id),
        role: "assistant",
        text: renderTemplateBody(String(job.template_name), [firstName]),
        messageType: "template",
        externalMessageId: result.externalMessageId,
        deliveryStatus: "sent",
      });
      await touchConversation(String(job.conversation_id), {
        lastOutbound: true,
        templateName: String(job.template_name),
        templateStatus: `drip_step_${job.step}`,
      });
    }

    console.info("[follow-up-worker] sent step", job.step, phone);
  }
}

export function startFollowUpWorker(): void {
  if (!config.workers.followUp) {
    console.info("[follow-up-worker] disabled (IR_FOLLOW_UP_WORKER_ENABLED)");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, 60_000);
  console.info("[follow-up-worker] started");
  void schedulePendingDocumentReminders();
  void tick();
}
