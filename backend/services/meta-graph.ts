import { config } from "../config.js";

export type LeadgenFieldData = {
  name?: string;
  phone?: string;
  email?: string;
  isDoctor?: boolean | null;
  doctorAnswer?: string;
  rawFields: Record<string, string>;
};

export function isMetaWhatsAppConfigured(): boolean {
  return Boolean(
    config.meta.phoneNumberId &&
      config.meta.whatsappToken &&
      config.meta.templateInitial,
  );
}

export function isMetaGraphConfigured(): boolean {
  return Boolean(config.meta.pageToken || config.meta.whatsappToken);
}

function graphUrl(path: string): string {
  const version = config.meta.graphVersion.replace(/^v?/, "v");
  return `https://graph.facebook.com/${version}/${path}`;
}

async function graphFetch<T>(
  path: string,
  init?: RequestInit,
  tokenOverride?: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const token = tokenOverride ?? config.meta.whatsappToken;
  if (!token) {
    return { ok: false, status: 0, error: "meta_token_not_configured" };
  }

  const url = new URL(graphUrl(path));
  url.searchParams.set("access_token", token);

  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: number };
    };

    if (!res.ok) {
      const msg =
        (body as { error?: { message?: string } }).error?.message ??
        `graph_http_${res.status}`;
      return { ok: false, status: res.status, error: msg };
    }

    return { ok: true, data: body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "graph_fetch_failed",
    };
  }
}

function parseFieldData(
  fieldData: Array<{ name?: string; values?: string[] }> | undefined,
): LeadgenFieldData {
  const rawFields: Record<string, string> = {};
  for (const field of fieldData ?? []) {
    const key = (field.name ?? "").toLowerCase();
    const value = field.values?.[0] ?? "";
    if (key) rawFields[key] = value;
  }

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = rawFields[k];
      if (v) return v;
    }
    return undefined;
  };

  const pickByContains = (...needles: string[]) => {
    for (const [key, value] of Object.entries(rawFields)) {
      const normalizedKey = key
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
      if (needles.some((needle) => normalizedKey.includes(needle))) {
        return value;
      }
    }
    return undefined;
  };

  const doctorAnswer =
    pick(
      "medico",
      "médico",
      "e_medico",
      "é_médico",
      "voce_e_medico",
      "você_é_médico",
      "medico_a",
      "médico_a",
      "medica",
      "médica",
    ) ?? pickByContains("medic");
  const normalizedDoctor = (doctorAnswer ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const isDoctor = doctorAnswer
    ? /\b(sim|sou|medico|medica)\b/.test(normalizedDoctor) &&
      !/\b(nao|não)\b/.test(normalizedDoctor)
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

/** Busca detalhes do lead na Graph API quando o webhook só envia leadgen_id. */
export async function fetchLeadgenDetails(
  leadgenId: string,
): Promise<LeadgenFieldData | null> {
  if (!isMetaGraphConfigured()) {
    console.warn("[meta-graph] token missing — cannot fetch leadgen", leadgenId);
    return null;
  }

  const token = config.meta.pageToken || config.meta.whatsappToken;
  const result = await graphFetch<{ field_data?: Array<{ name?: string; values?: string[] }> }>(
    leadgenId,
    undefined,
    token,
  );

  if (!result.ok) {
    console.error("[meta-graph] fetchLeadgenDetails", leadgenId, result.error);
    return null;
  }

  return parseFieldData(result.data.field_data);
}

function normalizeWaRecipient(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** Envia template WhatsApp via Cloud API. Retorna null se credenciais ausentes (stub). */
export async function sendWhatsAppTemplate(input: {
  toE164: string;
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
}): Promise<
  | { ok: true; externalMessageId: string }
  | { ok: false; permanent: boolean; error: string; status?: number }
> {
  if (!isMetaWhatsAppConfigured()) {
    console.warn("[meta-graph] WA not configured — stub send", input.templateName);
    return {
      ok: true,
      externalMessageId: `stub_${Date.now()}`,
    };
  }

  const to = normalizeWaRecipient(input.toE164);
  const components =
    input.bodyParameters && input.bodyParameters.length > 0
      ? [
          {
            type: "body",
            parameters: input.bodyParameters.map((text) => ({
              type: "text",
              text,
            })),
          },
        ]
      : undefined;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      ...(components ? { components } : {}),
    },
  };

  const result = await graphFetch<{ messages?: Array<{ id?: string }> }>(
    `${config.meta.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!result.ok) {
    const permanent =
      result.status === 400 ||
      result.status === 401 ||
      result.status === 403 ||
      result.error.includes("132001");
    return {
      ok: false,
      permanent,
      error: result.error,
      status: result.status,
    };
  }

  const externalMessageId = result.data.messages?.[0]?.id ?? `sent_${Date.now()}`;
  return { ok: true, externalMessageId };
}

/**
 * Baixa mídia recebida: Graph devolve URL temporária que exige o mesmo token.
 * Retorna null quando não configurado ou quando a Meta recusa.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<
  | {
      buffer: Buffer;
      mimeType: string;
      sizeBytes: number;
      filename?: string;
    }
  | null
> {
  const token = config.meta.whatsappToken;
  if (!token) {
    console.warn("[meta-graph] token missing — cannot download media", mediaId);
    return null;
  }

  const meta = await graphFetch<{
    url?: string;
    mime_type?: string;
    file_size?: number;
    sha256?: string;
  }>(mediaId);

  if (!meta.ok || !meta.data.url) {
    console.error("[meta-graph] media metadata", mediaId, meta.ok ? "no_url" : meta.error);
    return null;
  }

  try {
    // A URL do CDN não aceita access_token na query — precisa do header.
    const res = await fetch(meta.data.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error("[meta-graph] media download http", res.status);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      buffer,
      mimeType: meta.data.mime_type ?? "application/octet-stream",
      sizeBytes: meta.data.file_size ?? buffer.byteLength,
    };
  } catch (err) {
    console.error("[meta-graph] media download", err);
    return null;
  }
}

/** Free-text na janela 24h (após reply do lead). Stub se token/phone ausentes. */
export async function sendWhatsAppText(input: {
  toE164: string;
  text: string;
  contextMessageId?: string | null;
}): Promise<
  | { ok: true; externalMessageId: string }
  | { ok: false; permanent: boolean; error: string; status?: number }
> {
  const { phoneNumberId, whatsappToken } = config.meta;
  if (!phoneNumberId || !whatsappToken) {
    console.warn("[meta-graph] WA not configured — stub text");
    return { ok: true, externalMessageId: `stub_text_${Date.now()}` };
  }

  const payload = {
    messaging_product: "whatsapp",
    to: normalizeWaRecipient(input.toE164),
    type: "text",
    text: { body: input.text.slice(0, 4000) },
    ...(input.contextMessageId
      ? { context: { message_id: input.contextMessageId } }
      : {}),
  };

  const result = await graphFetch<{ messages?: Array<{ id?: string }> }>(
    `${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      permanent: result.status === 400 || result.status === 401 || result.status === 403,
      error: result.error,
      status: result.status,
    };
  }

  return {
    ok: true,
    externalMessageId: result.data.messages?.[0]?.id ?? `sent_${Date.now()}`,
  };
}

let cachedPdfMediaId: { id: string; at: number } | null = null;
const MEDIA_ID_TTL_MS = 20 * 24 * 3600_000;

async function uploadWhatsAppPdf(
  buffer: Buffer,
  filename: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  return uploadWhatsAppMedia(buffer, filename, "application/pdf");
}

async function uploadWhatsAppMedia(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  const { phoneNumberId, whatsappToken, graphVersion } = config.meta;
  if (!phoneNumberId || !whatsappToken) {
    return { ok: false, error: "wa_not_configured" };
  }

  const version = graphVersion.replace(/^v?/, "v");
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/media`;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    filename,
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${whatsappToken}` },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!res.ok || !body.id) {
      return {
        ok: false,
        error: body.error?.message ?? `media_upload_${res.status}`,
      };
    }
    return { ok: true, mediaId: body.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "media_upload_failed",
    };
  }
}

/** Envia mídia manual do painel dentro da janela 24h. */
export async function sendWhatsAppMedia(input: {
  toE164: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  caption?: string;
  contextMessageId?: string | null;
}): Promise<
  | { ok: true; externalMessageId: string; messageType: "image" | "audio" | "video" | "document" }
  | { ok: false; permanent: boolean; error: string }
> {
  const { phoneNumberId, whatsappToken } = config.meta;
  if (!phoneNumberId || !whatsappToken) {
    console.warn("[meta-graph] WA not configured — stub media");
    return {
      ok: true,
      externalMessageId: `stub_media_${Date.now()}`,
      messageType: mediaMessageType(input.mimeType),
    };
  }

  const uploaded = await uploadWhatsAppMedia(
    input.buffer,
    input.filename,
    input.mimeType,
  );
  if (!uploaded.ok) {
    return { ok: false, permanent: false, error: uploaded.error };
  }

  const messageType = mediaMessageType(input.mimeType);
  const mediaPayload =
    messageType === "audio"
      ? { id: uploaded.mediaId }
      : messageType === "document"
        ? {
            id: uploaded.mediaId,
            filename: input.filename,
            caption: (input.caption ?? "").slice(0, 1024),
          }
        : {
            id: uploaded.mediaId,
            caption: (input.caption ?? "").slice(0, 1024),
          };
  const payload = {
    messaging_product: "whatsapp",
    to: normalizeWaRecipient(input.toE164),
    type: messageType,
    [messageType]: mediaPayload,
    ...(input.contextMessageId
      ? { context: { message_id: input.contextMessageId } }
      : {}),
  };

  const result = await graphFetch<{ messages?: Array<{ id?: string }> }>(
    `${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      permanent:
        result.status === 400 ||
        result.status === 401 ||
        result.status === 403,
      error: result.error,
    };
  }

  return {
    ok: true,
    externalMessageId: result.data.messages?.[0]?.id ?? `sent_media_${Date.now()}`,
    messageType,
  };
}

function mediaMessageType(mimeType: string): "image" | "audio" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

/** Envia PDF (passo a passo CNIS). Usa cache do media_id da Meta. */
export async function sendWhatsAppDocument(input: {
  toE164: string;
  buffer: Buffer;
  filename: string;
  caption?: string;
}): Promise<
  | { ok: true; externalMessageId: string }
  | { ok: false; permanent: boolean; error: string }
> {
  const { phoneNumberId, whatsappToken } = config.meta;
  if (!phoneNumberId || !whatsappToken) {
    console.warn("[meta-graph] WA not configured — stub document");
    return { ok: true, externalMessageId: `stub_doc_${Date.now()}` };
  }

  const fresh =
    cachedPdfMediaId && Date.now() - cachedPdfMediaId.at < MEDIA_ID_TTL_MS
      ? cachedPdfMediaId.id
      : null;

  let mediaId = fresh;
  if (!mediaId) {
    const uploaded = await uploadWhatsAppPdf(input.buffer, input.filename);
    if (!uploaded.ok) {
      return { ok: false, permanent: false, error: uploaded.error };
    }
    mediaId = uploaded.mediaId;
    cachedPdfMediaId = { id: mediaId, at: Date.now() };
  }

  const payload = {
    messaging_product: "whatsapp",
    to: normalizeWaRecipient(input.toE164),
    type: "document",
    document: {
      id: mediaId,
      filename: input.filename,
      caption: (input.caption ?? "").slice(0, 1024),
    },
  };

  const result = await graphFetch<{ messages?: Array<{ id?: string }> }>(
    `${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!result.ok) {
    cachedPdfMediaId = null;
    return {
      ok: false,
      permanent:
        result.status === 400 ||
        result.status === 401 ||
        result.status === 403,
      error: result.error,
    };
  }

  return {
    ok: true,
    externalMessageId: result.data.messages?.[0]?.id ?? `sent_doc_${Date.now()}`,
  };
}
