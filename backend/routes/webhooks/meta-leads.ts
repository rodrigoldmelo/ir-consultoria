import { Router } from "express";
import type { Request, Response } from "express";
import { config } from "../../config.js";
import { verifyMetaSignature } from "../../middleware/meta-signature.js";
import { fetchLeadgenDetails } from "../../services/meta-graph.js";
import { ingestLead } from "../../services/lead-ingestion.js";
import { wakeTemplateWorker } from "../../workers/template-worker.js";

const router = Router();

/** Verificação do webhook Meta Lead Ads */
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === config.meta.verifyToken) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }

  res.sendStatus(403);
});

/**
 * Entrada de lead (payload Meta Leadgen).
 * Se o webhook só enviar leadgen_id, busca detalhes na Graph API.
 */
router.post("/", verifyMetaSignature, (req: Request, res: Response) => {
  res.status(200).json({ received: true });
  void processLeadgen(req.body as Record<string, unknown>).catch((err) => {
    console.error("[meta-leads] error", err);
  });
});

async function processLeadgen(body: Record<string, unknown>): Promise<void> {
  const entry = Array.isArray(body.entry) ? body.entry[0] : null;
  const change =
    entry &&
    typeof entry === "object" &&
    Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: Array<{ value?: Record<string, unknown> }> }).changes[0]
      : null;
  const value = change?.value ?? body;

  const bodyFields = extractFieldData(body);
  const valueFields = extractFieldData(value);
  let metaLeadgenId = String(
    value.leadgen_id ?? value.leadgenId ?? body.leadgen_id ?? "",
  );
  let phone = String(
    value.phone_number ??
      value.phone ??
      body.phone ??
      valueFields.phone ??
      bodyFields.phone ??
      "",
  );
  let name = String(
    value.full_name ??
      value.name ??
      body.name ??
      valueFields.name ??
      bodyFields.name ??
      "",
  );
  let email =
    String(value.email ?? body.email ?? valueFields.email ?? bodyFields.email ?? "") ||
    undefined;
  let isDoctor = valueFields.isDoctor ?? bodyFields.isDoctor ?? null;
  let doctorAnswer = valueFields.doctorAnswer ?? bodyFields.doctorAnswer;

  if (metaLeadgenId && (!phone || !name)) {
    const details = await fetchLeadgenDetails(metaLeadgenId);
    if (details) {
      phone = phone || details.phone || "";
      name = name || details.name || "";
      email = email || details.email;
      isDoctor = isDoctor ?? details.isDoctor ?? null;
      doctorAnswer = doctorAnswer || details.doctorAnswer;
    }
  }

  const result = await ingestLead({
    metaLeadgenId,
    phone: phone || undefined,
    name: name || undefined,
    email,
    formId: value.form_id ? String(value.form_id) : undefined,
    campaignId: value.campaign_id ? String(value.campaign_id) : undefined,
    adId: value.ad_id ? String(value.ad_id) : undefined,
    optInWhatsapp: true,
    isDoctor,
    doctorAnswer,
    rawPayload: {
      ...body,
      parsed_form: {
        name: name || undefined,
        phone: phone || undefined,
        email,
        is_doctor: isDoctor,
        doctor_answer: doctorAnswer,
        raw_fields: {
          ...bodyFields.rawFields,
          ...valueFields.rawFields,
        },
      },
    },
  });

  if (result.status === "queued") {
    wakeTemplateWorker(result.metaLeadgenId);
  }

  console.info("[meta-leads]", result.status, "metaLeadgenId" in result ? result.metaLeadgenId : result.reason);
}

function extractFieldData(source: unknown): {
  name?: string;
  phone?: string;
  email?: string;
  isDoctor?: boolean | null;
  doctorAnswer?: string;
  rawFields: Record<string, string>;
} {
  const fieldData =
    source &&
    typeof source === "object" &&
    Array.isArray((source as { field_data?: unknown }).field_data)
      ? ((source as { field_data: Array<{ name?: string; values?: string[] }> })
          .field_data)
      : undefined;
  const rawFields: Record<string, string> = {};
  for (const field of fieldData ?? []) {
    const key = String(field.name ?? "").toLowerCase();
    const value = String(field.values?.[0] ?? "");
    if (key && value) rawFields[key] = value;
  }
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = rawFields[key];
      if (value) return value;
    }
    return undefined;
  };
  const doctorAnswer =
    pick("medico", "médico", "e_medico", "é_médico", "voce_e_medico", "você_é_médico") ??
    Object.entries(rawFields).find(([key]) =>
      key
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .includes("medic"),
    )?.[1];
  const normalizedDoctor = (doctorAnswer ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const isDoctor = doctorAnswer
    ? /\b(sim|sou|medico|medica)\b/.test(normalizedDoctor) &&
      !/\b(nao)\b/.test(normalizedDoctor)
    : null;
  return {
    name: pick("full_name", "nome", "name", "first_name"),
    phone: pick("phone_number", "telefone", "phone", "celular", "whatsapp"),
    email: pick("email", "e-mail"),
    isDoctor,
    doctorAnswer,
    rawFields,
  };
}

export default router;
