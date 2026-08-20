import { getSupabaseAdmin } from "../services/supabase.js";
import type { IngestedLead, LeadStatus } from "../types/index.js";

export type IrLeadRow = {
  id: string;
  meta_leadgen_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  form_id: string | null;
  campaign_id: string | null;
  ad_id: string | null;
  status: LeadStatus;
  opt_in_whatsapp: boolean | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
};

export async function findLeadByMetaId(
  metaLeadgenId: string,
): Promise<IrLeadRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("ir_leads")
    .select("*")
    .eq("meta_leadgen_id", metaLeadgenId)
    .maybeSingle();

  if (error) {
    console.error("[db/leads] findLeadByMetaId", error.message);
    throw error;
  }
  return data as IrLeadRow | null;
}

export async function insertLead(
  lead: IngestedLead & { phone: string; status?: LeadStatus },
): Promise<IrLeadRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const row = {
    meta_leadgen_id: lead.metaLeadgenId,
    name: lead.name ?? null,
    phone: lead.phone,
    email: lead.email ?? null,
    form_id: lead.formId ?? null,
    campaign_id: lead.campaignId ?? null,
    ad_id: lead.adId ?? null,
    opt_in_whatsapp: lead.optInWhatsapp ?? true,
    raw_payload: lead.rawPayload,
    status: lead.status ?? "template_queued",
    source: lead.source ?? "meta_lead_ads",
  };

  const { data, error } = await db
    .from("ir_leads")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return null; // duplicate meta_leadgen_id
    console.error("[db/leads] insertLead", error.message);
    throw error;
  }
  return data as IrLeadRow;
}

export async function findLeadByPhone(
  phone: string,
): Promise<IrLeadRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const digits = phone.replace(/\D/g, "");
  const candidates = [digits, `+${digits}`];

  for (const value of candidates) {
    const { data, error } = await db
      .from("ir_leads")
      .select("*")
      .eq("phone", value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[db/leads] findLeadByPhone", error.message);
      return null;
    }
    if (data) return data as IrLeadRow;
  }
  return null;
}

export async function updateLeadName(
  leadId: string,
  name: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  const { error } = await db
    .from("ir_leads")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) {
    console.error("[db/leads] updateLeadName", error.message);
  }
}

export async function getLeadById(id: string): Promise<IrLeadRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("ir_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[db/leads] getLeadById", error.message);
    return null;
  }
  return data as IrLeadRow | null;
}

export async function updateLeadStatus(
  metaLeadgenId: string,
  status: LeadStatus,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const { error } = await db
    .from("ir_leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("meta_leadgen_id", metaLeadgenId);

  if (error) {
    console.error("[db/leads] updateLeadStatus", error.message);
    throw error;
  }
}

export async function updateLeadStatusById(
  leadId: string,
  status: LeadStatus,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const { error } = await db
    .from("ir_leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    console.error("[db/leads] updateLeadStatusById", error.message);
    throw error;
  }
}

/**
 * Reserva o próximo lead aguardando template. O `eq("status", ...)` no update
 * é o que torna a reserva atômica: dois processos nunca pegam o mesmo lead.
 */
export async function claimLeadForTemplate(): Promise<IrLeadRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data: candidates, error } = await db
    .from("ir_leads")
    .select("id")
    .eq("status", "template_queued")
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error("[db/leads] claimLeadForTemplate select", error.message);
    return null;
  }

  for (const candidate of (candidates ?? []) as Array<{ id: string }>) {
    const { data: claimed, error: claimError } = await db
      .from("ir_leads")
      .update({ status: "template_sending", updated_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("status", "template_queued")
      .select("*")
      .maybeSingle();

    if (claimError) {
      console.error("[db/leads] claimLeadForTemplate update", claimError.message);
      continue;
    }
    if (claimed) return claimed as IrLeadRow;
  }

  return null;
}

/** Leads que ficaram em `template_sending` (queda no meio do disparo). */
export async function listStaleTemplateClaims(
  olderThanMinutes: number,
): Promise<IrLeadRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data, error } = await db
    .from("ir_leads")
    .select("*")
    .eq("status", "template_sending")
    .lt("updated_at", cutoff)
    .limit(20);

  if (error) {
    console.error("[db/leads] listStaleTemplateClaims", error.message);
    return [];
  }
  return (data ?? []) as IrLeadRow[];
}

export async function listLeads(limit = 50): Promise<IrLeadRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from("ir_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[db/leads] listLeads", error.message);
    throw error;
  }
  return (data ?? []) as IrLeadRow[];
}

export async function listCases(limit = 50) {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from("ir_cases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[db/leads] listCases", error.message);
    throw error;
  }
  return data ?? [];
}
