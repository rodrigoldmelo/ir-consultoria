/**
 * Worker de drip — templates #2/#3 para leads sem 1ª resposta.
 * Ativar: IR_FOLLOW_UP_WORKER_ENABLED=true + templates TRUST/EXPLAIN no env.
 */
import { config } from "../config.js";
import { insertMessage, touchConversation } from "../db/conversations.js";
import { getLeadById } from "../db/leads.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import {
  listDueDripJobs,
  markDripJob,
} from "../services/drip.js";
import { sendWhatsAppTemplate } from "../services/meta-graph.js";
import { firstNameFromLead } from "../services/post-template-briefing.js";
import { renderTemplateBody } from "../services/template-copy.js";

let timer: ReturnType<typeof setInterval> | null = null;

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

async function tick(): Promise<void> {
  const jobs = await listDueDripJobs(10);
  if (!jobs.length) return;

  for (const job of jobs) {
    const phone = String(job.phone);
    if (await leadAlreadyReplied(phone)) {
      await markDripJob(job.id, {
        status: "cancelled",
        cancelReason: "replied_or_closed",
      });
      continue;
    }

    let firstName = "olá";
    if (job.lead_id) {
      const lead = await getLeadById(String(job.lead_id));
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
  void tick();
}
