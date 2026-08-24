import { recordAuditEvent } from "../db/audit.js";
import {
  findLeadByMetaId,
  insertLead,
} from "../db/leads.js";
import { isPhoneOptedOut } from "../db/opt-outs.js";
import { isSupabaseConfigured } from "../services/supabase.js";
import { normalizePhoneE164 } from "./phone.js";
import type { IngestedLead } from "../types/index.js";

export type LeadIngestionResult =
  | { status: "queued"; metaLeadgenId: string; phone: string; leadId?: string }
  | { status: "duplicate"; metaLeadgenId: string; leadId?: string }
  | { status: "rejected"; reason: string };

/**
 * Persiste lead em ir_leads (se Supabase configurado) e prepara fila de template.
 * Sem Supabase: aceita em memória/log (dev local).
 */
export async function ingestLead(
  lead: IngestedLead,
): Promise<LeadIngestionResult> {
  if (!lead.metaLeadgenId) {
    return { status: "rejected", reason: "missing_meta_leadgen_id" };
  }

  const phone = normalizePhoneE164(lead.phone);
  if (!phone) {
    return { status: "rejected", reason: "invalid_phone" };
  }

  if (lead.optInWhatsapp === false) {
    return { status: "rejected", reason: "no_whatsapp_opt_in" };
  }

  if (await isPhoneOptedOut(phone)) {
    await recordAuditEvent({
      entityType: "lead",
      entityId: lead.metaLeadgenId,
      eventType: "lead_suppressed_opt_out",
      actorType: "webhook",
      summary: "Lead ignorado porque o telefone está na supressão global de opt-out",
      metadata: { phone, formId: lead.formId },
    });
    return { status: "rejected", reason: "opt_out" };
  }

  if (isSupabaseConfigured()) {
    const existing = await findLeadByMetaId(lead.metaLeadgenId);
    if (existing) {
      return {
        status: "duplicate",
        metaLeadgenId: lead.metaLeadgenId,
        leadId: existing.id,
      };
    }

    const inserted = await insertLead({ ...lead, phone, status: "template_queued" });
    if (!inserted) {
      return { status: "duplicate", metaLeadgenId: lead.metaLeadgenId };
    }

    await recordAuditEvent({
      entityType: "lead",
      entityId: inserted.id,
      eventType: "lead_received",
      actorType: "webhook",
      summary: `Lead ${lead.metaLeadgenId} ingerido`,
      metadata: { phone, formId: lead.formId },
    });

    return {
      status: "queued",
      metaLeadgenId: lead.metaLeadgenId,
      phone,
      leadId: inserted.id,
    };
  }

  console.info("[lead-ingestion] no Supabase — accept in memory", {
    metaLeadgenId: lead.metaLeadgenId,
    phone,
    name: lead.name,
  });

  return {
    status: "queued",
    metaLeadgenId: lead.metaLeadgenId,
    phone,
  };
}
