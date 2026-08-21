/**
 * Puxa leads do Instant Form via Graph e ingere (bypass do webhook Meta).
 *
 * Uso na VPS (token só no terminal, nunca no chat):
 *   export PAGE_TOKEN='...'
 *   printf '%s' '...' > /tmp/page_token.txt
 *   npx tsx scripts/meta-pull-leads.ts
 *   npx tsx scripts/meta-pull-leads.ts --form 1444863843996760
 *   npx tsx scripts/meta-pull-leads.ts --limit 3
 *   npx tsx scripts/meta-pull-leads.ts --token-file /tmp/page_token.txt
 */
import "../backend/env.js";
import { existsSync, readFileSync } from "node:fs";
import { config } from "../backend/config.js";
import { ingestLead } from "../backend/services/lead-ingestion.js";
import { wakeTemplateWorker } from "../backend/workers/template-worker.js";

type GraphLead = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
};

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sanitizeAccessToken(raw: string): string {
  let next = raw.trim();

  try {
    const parsed = JSON.parse(next) as { access_token?: string };
    if (parsed?.access_token) next = parsed.access_token;
  } catch {
    // O token normalmente é texto puro; JSON é só uma conveniência para copy/paste.
  }

  const accessTokenParam = next.match(/access_token=([^&\s"']+)/);
  if (accessTokenParam?.[1]) next = accessTokenParam[1];

  next = next.trim().replace(/^['"]|['"]$/g, "");
  return next.replace(/[\s\u200B-\u200D\uFEFF]/g, "");
}

function readPageToken(): { token: string; source: string } {
  const tokenFile = argValue("--token-file") ?? process.env.PAGE_TOKEN_FILE ?? "/tmp/page_token.txt";
  const envToken = process.env.PAGE_TOKEN ?? process.env.IR_META_PAGE_TOKEN ?? "";
  if (envToken.trim()) {
    return { token: sanitizeAccessToken(envToken), source: "env" };
  }
  if (existsSync(tokenFile)) {
    return {
      token: sanitizeAccessToken(readFileSync(tokenFile, "utf8")),
      source: tokenFile,
    };
  }
  return { token: "", source: "none" };
}

function pickField(
  fields: Array<{ name?: string; values?: string[] }> | undefined,
  ...keys: string[]
): string | undefined {
  const map = new Map<string, string>();
  for (const f of fields ?? []) {
    const k = String(f.name ?? "").toLowerCase();
    const v = String(f.values?.[0] ?? "");
    if (k && v) map.set(k, v);
  }
  for (const key of keys) {
    const v = map.get(key);
    if (v) return v;
  }
  for (const [k, v] of map) {
    if (keys.some((needle) => k.includes(needle))) return v;
  }
  return undefined;
}

function rawFieldsFromFieldData(
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

async function graphGet<T>(path: string, token: string): Promise<T> {
  const version = config.meta.graphVersion.replace(/^v?/, "v");
  const [pathname, query = ""] = path.split("?");
  const url = new URL(`https://graph.facebook.com/${version}/${pathname}`);
  if (query) {
    for (const part of query.split("&")) {
      const [k, ...rest] = part.split("=");
      if (k) url.searchParams.set(k, rest.join("="));
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

async function main(): Promise<void> {
  const { token, source } = readPageToken();
  if (!token) {
    console.error(
      "PAGE_TOKEN vazio. Opções seguras na VPS, sem colar token no chat:\n" +
        "  export PAGE_TOKEN='cole_o_page_access_token'\n" +
        "  printf '%s' 'cole_o_page_access_token' > /tmp/page_token.txt\n" +
        "  PAGE_TOKEN_FILE=/tmp/page_token.txt npx tsx scripts/meta-pull-leads.ts --form 1444863843996760",
    );
    process.exit(1);
  }
  if (token.length < 50) {
    console.error(`Token curto demais após limpeza (source=${source}, len=${token.length}). Confira se copiou o Page Access Token inteiro.`);
    process.exit(1);
  }
  console.log(`Token carregado (source=${source}, len=${token.length}). Validando na Graph...`);
  const me = await graphGet<{ id?: string; name?: string }>("me?fields=id,name", token);
  console.log(`Token Graph OK (${me.name ?? me.id ?? "page"}).`);

  const formId =
    argValue("--form") ??
    config.meta.formIds[0] ??
    "1444863843996760";
  const limit = Number(argValue("--limit") ?? "5") || 5;

  console.log(`Form ${formId} — buscando até ${limit} lead(s)...`);
  const list = await graphGet<{ data?: GraphLead[] }>(
    `${formId}/leads?fields=id,created_time,field_data&limit=${limit}`,
    token,
  );
  const leads = list.data ?? [];
  if (!leads.length) {
    console.error("Nenhum lead nesse form. Confira o Form ID na Central de leads.");
    process.exit(1);
  }

  for (const lead of leads) {
    const name = pickField(lead.field_data, "full_name", "nome", "name");
    const phone = pickField(
      lead.field_data,
      "phone_number",
      "telefone",
      "phone",
      "celular",
      "whatsapp",
    );
    const email = pickField(lead.field_data, "email", "e-mail");
    const doctorAnswer = pickField(
      lead.field_data,
      "medico",
      "médico",
      "voce_e_medico",
      "você_é_médico",
    );
    const rawFields = rawFieldsFromFieldData(lead.field_data);

    const result = await ingestLead({
      metaLeadgenId: lead.id,
      name,
      phone,
      email,
      formId,
      optInWhatsapp: true,
      doctorAnswer,
      isDoctor: doctorAnswer
        ? /\bsim\b/i.test(doctorAnswer) && !/\bn[aã]o\b/i.test(doctorAnswer)
        : null,
      source: "meta_pull",
      rawPayload: {
        pulled_at: new Date().toISOString(),
        lead,
        parsed_form: {
          name,
          phone,
          email,
          is_doctor: doctorAnswer
            ? /\bsim\b/i.test(doctorAnswer) && !/\bn[aã]o\b/i.test(doctorAnswer)
            : null,
          doctor_answer: doctorAnswer,
          raw_fields: rawFields,
        },
      },
    });

    console.log(
      `[pull] ${lead.id} ${lead.created_time ?? ""} → ${result.status}` +
        ("reason" in result ? ` (${result.reason})` : ""),
    );

    if (result.status === "queued") {
      wakeTemplateWorker(result.metaLeadgenId);
      if (!hasFlag("--all")) break;
    }
  }

  console.log("Pronto. Confira painel + WhatsApp.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
