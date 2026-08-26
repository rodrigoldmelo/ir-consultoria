import { config } from "../config.js";
import { recordAuditEvent } from "../db/audit.js";
import { findOrCreateCaseForConversation, updateCase } from "../db/cases.js";
import { getConversationById } from "../db/conversations.js";
import { getSupabaseAdmin } from "./supabase.js";

type AdvboxJson = Record<string, unknown>;

type AdvboxSyncResult =
  | {
      ok: true;
      cpf: string;
      customerId: string;
      lawsuitId: string;
      taskId: string;
      reused: boolean;
    }
  | { ok: false; error: string; details?: unknown };

const CPF_RE = /(?:cpf\D*)?(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/gi;

function requiredAdvboxEnv(): string[] {
  const missing: string[] = [];
  if (!config.advbox.baseUrl) missing.push("IR_ADVBOX_BASE_URL");
  if (!config.advbox.apiToken) missing.push("IR_ADVBOX_API_TOKEN");
  if (!config.advbox.originId) missing.push("IR_ADVBOX_ORIGIN_ID");
  if (!config.advbox.responsibleUserId) {
    missing.push("IR_ADVBOX_RESPONSIBLE_USER_ID");
  }
  if (!config.advbox.taskCreatorUserId) {
    missing.push("IR_ADVBOX_TASK_CREATOR_USER_ID");
  }
  if (!config.advbox.calculationUserId) {
    missing.push("IR_ADVBOX_CALCULATION_USER_ID");
  }
  if (!config.advbox.stageId) missing.push("IR_ADVBOX_STAGE_ID");
  if (!config.advbox.caseTypeId) missing.push("IR_ADVBOX_CASE_TYPE_ID");
  if (!config.advbox.taskTypeId) missing.push("IR_ADVBOX_TASK_TYPE_ID");
  return missing;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function stripBrazilCountryCode(phone: string): string {
  const digits = onlyDigits(phone);
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
}

function isValidCpf(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (slice: string) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i += 1) {
      sum += Number(slice[i]) * (slice.length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return (
    calc(cpf.slice(0, 9)) === Number(cpf[9]) &&
    calc(cpf.slice(0, 10)) === Number(cpf[10])
  );
}

function findCpfInText(text: string): string | null {
  for (const match of text.matchAll(CPF_RE)) {
    const cpf = onlyDigits(match[1] ?? "");
    if (isValidCpf(cpf)) return cpf;
  }
  return null;
}

function extractCpfFromBuffer(buffer: Buffer): string | null {
  return findCpfInText(`${buffer.toString("utf8")}\n${buffer.toString("latin1")}`);
}

async function advboxRequest(path: string, init: RequestInit = {}): Promise<AdvboxJson> {
  const res = await fetch(`${config.advbox.baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.advbox.apiToken}`,
      "User-Agent": "IR-Consultoria/1.0 https://ir.meuanalistacrm.app",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: AdvboxJson = {};
  try {
    body = text ? (JSON.parse(text) as AdvboxJson) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(JSON.stringify({ status: res.status, body }));
  }
  return body;
}

function responseId(body: AdvboxJson, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return null;
}

export async function syncConversationToAdvbox(input: {
  conversationId: string;
  cpf?: string | null;
}): Promise<AdvboxSyncResult> {
  const missingEnv = requiredAdvboxEnv();
  if (missingEnv.length) {
    return { ok: false, error: `missing_env:${missingEnv.join(",")}` };
  }

  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "supabase_off" };

  const conversation = await getConversationById(input.conversationId);
  if (!conversation) return { ok: false, error: "conversation_not_found" };

  const irCase = await findOrCreateCaseForConversation({
    conversationId: conversation.id,
    leadId: conversation.lead_id,
  });
  if (!irCase) return { ok: false, error: "case_not_found" };

  const { data: lead } = conversation.lead_id
    ? await db
        .from("ir_leads")
        .select("name, phone, email, raw_payload")
        .eq("id", conversation.lead_id)
        .maybeSingle()
    : { data: null };

  const { data: documents, error: docsError } = await db
    .from("ir_documents")
    .select("id, document_type, original_filename, mime_type, storage_bucket, storage_path, created_at")
    .eq("case_id", irCase.id)
    .neq("classification_status", "panel_outbound_media")
    .order("created_at", { ascending: true });
  if (docsError) return { ok: false, error: "documents_error", details: docsError.message };

  const caseDocs = documents ?? [];
  const hasCnis = caseDocs.some((doc) => doc.document_type === "cnis");
  const hasDirf = caseDocs.some((doc) => doc.document_type === "dirf_income");
  if (!hasCnis || !hasDirf) {
    return { ok: false, error: "missing_required_documents" };
  }

  let cpf = input.cpf?.trim() ? onlyDigits(input.cpf) : null;
  if (cpf && !isValidCpf(cpf)) return { ok: false, error: "invalid_cpf" };

  if (!cpf) {
    for (const doc of caseDocs) {
      if (!doc.storage_path) continue;
      const download = await db.storage
        .from(doc.storage_bucket ?? config.supabase.documentsBucket)
        .download(doc.storage_path);
      if (download.error || !download.data) continue;
      const buffer = Buffer.from(await download.data.arrayBuffer());
      cpf = extractCpfFromBuffer(buffer);
      if (cpf) break;
    }
  }
  if (!cpf) return { ok: false, error: "cpf_required" };

  if (irCase.advbox_client_id && irCase.advbox_case_id && irCase.advbox_task_id) {
    return {
      ok: true,
      cpf,
      customerId: irCase.advbox_client_id,
      lawsuitId: irCase.advbox_case_id,
      taskId: irCase.advbox_task_id,
      reused: true,
    };
  }

  const documentLines = await Promise.all(
    caseDocs.map(async (doc) => {
      const signed = doc.storage_path
        ? await db.storage
            .from(doc.storage_bucket ?? config.supabase.documentsBucket)
            .createSignedUrl(doc.storage_path, 60 * 60 * 24 * 7)
        : null;
      const url = signed?.data?.signedUrl ?? "sem link";
      return `- ${doc.document_type ?? "documento"}: ${
        doc.original_filename ?? doc.mime_type ?? doc.id
      } (${url})`;
    }),
  );

  const rawPayload = lead?.raw_payload as
    | { parsed_form?: { doctor_answer?: string } }
    | null;
  const customerName =
    String(lead?.name ?? "").trim() ||
    conversation.whatsapp_wa_id ||
    conversation.phone;
  const customerPhone = stripBrazilCountryCode(String(lead?.phone ?? conversation.phone));
  const customerEmail = String(lead?.email ?? "").trim();

  const customer = await advboxRequest("/customers", {
    method: "POST",
    body: JSON.stringify({
      users_id: config.advbox.responsibleUserId,
      customers_origins_id: config.advbox.originId,
      name: customerName,
      email: customerEmail || undefined,
      cellphone: customerPhone,
      identification: cpf,
      occupation: "Médico",
      notes: [
        "Lead cadastrado pela integração IR Consultoria.",
        `Médico(a): ${rawPayload?.parsed_form?.doctor_answer ?? "não informado"}`,
        `Telefone WhatsApp: ${conversation.phone}`,
      ].join("\n"),
    }),
  });
  const customerId = responseId(customer, ["customers_id", "id", "customer_id"]);
  if (!customerId) {
    return { ok: false, error: "advbox_customer_id_missing", details: customer };
  }

  const lawsuit = await advboxRequest("/lawsuits", {
    method: "POST",
    body: JSON.stringify({
      users_id: config.advbox.responsibleUserId,
      customers_id: [Number(customerId)],
      stages_id: config.advbox.stageId,
      type_lawsuits_id: config.advbox.caseTypeId,
      folder: `IR-${customerId}`.slice(0, 30),
      notes:
        "Caso criado pela integração IR Consultoria para análise de possível restituição de contribuições ao INSS.",
    }),
  });
  const lawsuitId = responseId(lawsuit, ["lawsuits_id", "id", "lawsuit_id"]);
  if (!lawsuitId) {
    return { ok: false, error: "advbox_lawsuit_id_missing", details: lawsuit };
  }

  const today = new Date().toISOString().slice(0, 10);
  const task = await advboxRequest("/posts", {
    method: "POST",
    body: JSON.stringify({
      from: config.advbox.taskCreatorUserId,
      guests: [Number(config.advbox.calculationUserId)],
      tasks_id: config.advbox.taskTypeId,
      lawsuits_id: lawsuitId,
      start_date: today,
      date_deadline: today,
      urgent: false,
      important: true,
      display_schedule: true,
      comments: [
        "Analisar documentos para cálculo de possível restituição de contribuições ao INSS.",
        `Cliente: ${customerName}`,
        `CPF: ${cpf}`,
        `Telefone: ${conversation.phone}`,
        customerEmail ? `E-mail: ${customerEmail}` : null,
        "",
        "Documentos recebidos na IR:",
        ...documentLines,
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });
  const taskId = responseId(task, ["posts_id", "id", "post_id"]);
  if (!taskId) return { ok: false, error: "advbox_task_id_missing", details: task };

  await updateCase(irCase.id, {
    status: "advbox_synced",
    advboxClientId: customerId,
    advboxCaseId: lawsuitId,
    advboxTaskId: taskId,
    assignedTo: config.advbox.calculationUserId,
  });
  await recordAuditEvent({
    entityType: "case",
    entityId: irCase.id,
    eventType: "advbox_sync",
    actorType: "human",
    summary: `Advbox criado: contato ${customerId}, caso ${lawsuitId}, tarefa ${taskId}`,
    metadata: { customerId, lawsuitId, taskId, cpf },
  });

  return { ok: true, cpf, customerId, lawsuitId, taskId, reused: false };
}
