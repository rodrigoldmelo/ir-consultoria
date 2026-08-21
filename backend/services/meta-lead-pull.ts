import { config } from "../config.js";
import { ingestLead, type LeadIngestionResult } from "./lead-ingestion.js";

export type GraphLead = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
};

export type PullMetaLeadsResult = {
  formId: string;
  fetched: number;
  results: Array<{
    leadId: string;
    createdTime?: string;
    result: LeadIngestionResult;
  }>;
};

export function pickLeadField(
  fields: Array<{ name?: string; values?: string[] }> | undefined,
  ...keys: string[]
): string | undefined {
  const map = new Map<string, string>();
  for (const field of fields ?? []) {
    const key = String(field.name ?? "").toLowerCase();
    const value = String(field.values?.[0] ?? "");
    if (key && value) map.set(key, value);
  }
  for (const key of keys) {
    const value = map.get(key);
    if (value) return value;
  }
  for (const [key, value] of map) {
    if (keys.some((needle) => key.includes(needle))) return value;
  }
  return undefined;
}

export function rawFieldsFromFieldData(
  fields: Array<{ name?: string; values?: string[] }> | undefined,
): Record<string, string> {
  const rawFields: Record<string, string> = {};
  for (const field of fields ?? []) {
    const key = String(field.name ?? "").toLowerCase();
    const value = String(field.values?.[0] ?? "");
    if (key) rawFields[key] = value;
  }
  return rawFields;
}

export async function graphGet<T>(path: string, token: string): Promise<T> {
  const version = config.meta.graphVersion.replace(/^v?/, "v");
  const [pathname, query = ""] = path.split("?");
  const url = new URL(`https://graph.facebook.com/${version}/${pathname}`);
  if (query) {
    for (const part of query.split("&")) {
      const [key, ...rest] = part.split("=");
      if (key) url.searchParams.set(key, rest.join("="));
    }
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `graph_http_${res.status}`);
  }
  return body;
}

export async function ingestGraphLead(input: {
  lead: GraphLead;
  formId: string;
  source?: string;
}): Promise<LeadIngestionResult> {
  const { lead, formId } = input;
  const name = pickLeadField(lead.field_data, "full_name", "nome", "name");
  const phone = pickLeadField(
    lead.field_data,
    "phone_number",
    "telefone",
    "phone",
    "celular",
    "whatsapp",
  );
  const email = pickLeadField(lead.field_data, "email", "e-mail");
  const doctorAnswer = pickLeadField(
    lead.field_data,
    "medico",
    "médico",
    "voce_e_medico",
    "você_é_médico",
  );
  const isDoctor = doctorAnswer
    ? /\bsim\b/i.test(doctorAnswer) && !/\bn[aã]o\b/i.test(doctorAnswer)
    : null;

  return ingestLead({
    metaLeadgenId: lead.id,
    name,
    phone,
    email,
    formId,
    optInWhatsapp: true,
    doctorAnswer,
    isDoctor,
    source: input.source ?? "meta_pull",
    rawPayload: {
      pulled_at: new Date().toISOString(),
      lead,
      parsed_form: {
        name,
        phone,
        email,
        is_doctor: isDoctor,
        doctor_answer: doctorAnswer,
        raw_fields: rawFieldsFromFieldData(lead.field_data),
      },
    },
  });
}

export async function pullMetaLeads(input: {
  token: string;
  formId: string;
  limit?: number;
  source?: string;
}): Promise<PullMetaLeadsResult> {
  const list = await graphGet<{ data?: GraphLead[] }>(
    `${input.formId}/leads?fields=id,created_time,field_data&limit=${input.limit ?? 10}`,
    input.token,
  );
  const leads = list.data ?? [];
  const results: PullMetaLeadsResult["results"] = [];

  for (const lead of leads) {
    results.push({
      leadId: lead.id,
      createdTime: lead.created_time,
      result: await ingestGraphLead({
        lead,
        formId: input.formId,
        source: input.source,
      }),
    });
  }

  return { formId: input.formId, fetched: leads.length, results };
}
