import { findLeadByPhone, insertLead } from "../db/leads.js";
import { isPhoneOptedOut } from "../db/opt-outs.js";
import { config } from "../config.js";
import { wakeTemplateWorker } from "../workers/template-worker.js";
import { cancelDripForPhone } from "./drip.js";
import { normalizePhoneDigits, normalizePhoneE164 } from "./phone.js";
import { queueLeadInitialOutreach } from "./test-outreach.js";

export type OutreachRecipientInput = {
  name?: string;
  phone?: string;
  email?: string;
  isDoctor?: boolean | null;
};

export type OutreachBatchResult = {
  ok: true;
  templateName: string;
  received: number;
  queued: number;
  created: number;
  reused: number;
  skipped: Array<{
    phone?: string | null;
    name?: string | null;
    reason: string;
  }>;
};

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function batchLeadMetaId(batchId: string, phone: string, index: number): string {
  const digits = normalizePhoneDigits(phone);
  return `batch_${batchId}_${index}_${digits}`;
}

export async function queueInitialOutreachBatch(input: {
  recipients: OutreachRecipientInput[];
}): Promise<OutreachBatchResult | { ok: false; error: string }> {
  if (!config.meta.templateInitial) {
    return { ok: false, error: "missing_IR_WHATSAPP_TEMPLATE_INITIAL" };
  }

  const batchId = Date.now().toString(36);
  const seenPhones = new Set<string>();
  const skipped: OutreachBatchResult["skipped"] = [];
  let queued = 0;
  let created = 0;
  let reused = 0;

  for (let index = 0; index < input.recipients.length; index++) {
    const recipient = input.recipients[index];
    const phone = normalizePhoneE164(cleanString(recipient.phone));
    const name = cleanString(recipient.name);
    const email = cleanString(recipient.email);
    if (!phone) {
      skipped.push({ phone: recipient.phone ?? null, name: name ?? null, reason: "invalid_phone" });
      continue;
    }

    const phoneKey = normalizePhoneDigits(phone);
    if (seenPhones.has(phoneKey)) {
      skipped.push({ phone, name: name ?? null, reason: "duplicate_in_file" });
      continue;
    }
    seenPhones.add(phoneKey);

    if (await isPhoneOptedOut(phone)) {
      skipped.push({ phone, name: name ?? null, reason: "opt_out" });
      continue;
    }

    let lead = await findLeadByPhone(phone);
    if (lead?.status === "opt_out") {
      skipped.push({ phone, name: lead.name ?? name ?? null, reason: "opt_out" });
      continue;
    }
    if (
      lead &&
      ["template_queued", "template_sending", "template_sent", "awaiting_reply"].includes(
        lead.status,
      )
    ) {
      skipped.push({
        phone,
        name: lead.name ?? name ?? null,
        reason: `already_${lead.status}`,
      });
      continue;
    }

    if (!lead) {
      lead = await insertLead({
        metaLeadgenId: batchLeadMetaId(batchId, phone, index),
        phone,
        name,
        email,
        isDoctor:
          typeof recipient.isDoctor === "boolean" ? recipient.isDoctor : null,
        doctorAnswer:
          typeof recipient.isDoctor === "boolean"
            ? recipient.isDoctor
              ? "sim"
              : "não"
            : undefined,
        optInWhatsapp: true,
        source: "panel_batch",
        rawPayload: {
          source: "panel_batch",
          batch_id: batchId,
          parsed_form: {
            name: name ?? null,
            phone,
            email: email ?? null,
            is_doctor:
              typeof recipient.isDoctor === "boolean" ? recipient.isDoctor : null,
            doctor_answer:
              typeof recipient.isDoctor === "boolean"
                ? recipient.isDoctor
                  ? "sim"
                  : "não"
                : null,
          },
        },
        status: "template_queued",
      });
      if (lead) created++;
    } else {
      reused++;
      await cancelDripForPhone(phone, "panel_batch_initial_outreach");
    }

    if (!lead) {
      skipped.push({ phone, name: name ?? null, reason: "lead_prepare_failed" });
      continue;
    }

    const result = await queueLeadInitialOutreach({ leadId: lead.id });
    if (!result.ok) {
      skipped.push({ phone, name: lead.name ?? name ?? null, reason: result.error });
      continue;
    }
    queued++;
  }

  if (queued > 0) {
    wakeTemplateWorker(`batch_${batchId}`);
  }

  return {
    ok: true,
    templateName: config.meta.templateInitial,
    received: input.recipients.length,
    queued,
    created,
    reused,
    skipped,
  };
}
