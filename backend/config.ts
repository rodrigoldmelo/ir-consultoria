function stripEnvQuotes(value: string | undefined): string {
  let next = (value ?? "").trim();
  if (
    (next.startsWith('"') && next.endsWith('"')) ||
    (next.startsWith("'") && next.endsWith("'"))
  ) {
    next = next.slice(1, -1).trim();
  }
  return next;
}

function requiredInProd(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value && process.env.IR_APP_ENV === "production") {
    throw new Error(`Missing required env: ${name}`);
  }
  return value || undefined;
}

export const config = {
  env: process.env.IR_APP_ENV ?? "development",
  port: Number(process.env.PORT || 3010),
  // Em produção o nginx é o único caminho de entrada; escutar só o loopback
  // impede que a porta 3010 fique acessível direto pelo IP da VPS.
  bindAddress:
    process.env.IR_BIND_ADDRESS ??
    (process.env.IR_APP_ENV === "production" ? "127.0.0.1" : "0.0.0.0"),
  agentName: process.env.IR_AGENT_NAME ?? "IR Assistente",
  timezone: process.env.IR_DEFAULT_TIMEZONE ?? "America/Sao_Paulo",
  panelToken: stripEnvQuotes(process.env.IR_PANEL_TOKEN),
  panelLogin: {
    username:
      stripEnvQuotes(process.env.IR_PANEL_LOGIN_USER) || "admin",
    // `??` não trata string vazia: IR_PANEL_LOGIN_PASSWORD= no .env
    // impedia o fallback para IR_PANEL_TOKEN.
    password:
      stripEnvQuotes(process.env.IR_PANEL_LOGIN_PASSWORD) ||
      stripEnvQuotes(process.env.IR_PANEL_TOKEN),
  },
  publicApiUrl: (
    process.env.IR_PUBLIC_API_URL ?? "https://ir.meuanalistacrm.app"
  ).replace(/\/$/, ""),
  supabase: {
    url: process.env.IR_SUPABASE_URL ?? "",
    serviceRoleKey: process.env.IR_SUPABASE_SERVICE_ROLE_KEY ?? "",
    documentsBucket: process.env.IR_STORAGE_DOCUMENTS_BUCKET ?? "ir-documents",
  },
  openai: {
    apiKey: process.env.IR_OPENAI_API_KEY ?? "",
    model: process.env.IR_OPENAI_MODEL ?? "gpt-4o-mini",
    extractionModel: process.env.IR_OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini",
    reheatModel: process.env.IR_OPENAI_REHEAT_MODEL ?? "gpt-4o",
  },
  meta: {
    appId: process.env.IR_META_APP_ID ?? "",
    appSecret: process.env.IR_META_APP_SECRET ?? "",
    verifyToken: process.env.IR_META_VERIFY_TOKEN ?? "",
    pageId: process.env.IR_META_PAGE_ID ?? "",
    pageToken: process.env.IR_META_PAGE_TOKEN ?? "",
    formIds: (process.env.IR_META_FORM_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    graphVersion: process.env.IR_META_GRAPH_VERSION ?? "v20.0",
    wabaId: process.env.IR_META_WABA_ID ?? "",
    phoneNumberId: process.env.IR_META_PHONE_NUMBER_ID ?? "",
    whatsappToken: process.env.IR_META_WHATSAPP_TOKEN ?? "",
    templateInitial: process.env.IR_WHATSAPP_TEMPLATE_INITIAL ?? "contato_inicial",
    templateLanguage: process.env.IR_WHATSAPP_TEMPLATE_LANGUAGE ?? "pt_BR",
    templateTrust: process.env.IR_WHATSAPP_TEMPLATE_TRUST ?? "",
    templateExplain: process.env.IR_WHATSAPP_TEMPLATE_EXPLAIN ?? "",
    templateReheat: process.env.IR_WHATSAPP_TEMPLATE_REHEAT ?? "",
  },
  advbox: {
    baseUrl: process.env.IR_ADVBOX_BASE_URL ?? "",
    apiToken: process.env.IR_ADVBOX_API_TOKEN ?? "",
  },
  workers: {
    template: process.env.IR_TEMPLATE_WORKER_ENABLED !== "false",
    advboxSync: process.env.IR_ADVBOX_SYNC_WORKER_ENABLED === "true",
    documentClassification:
      process.env.IR_DOCUMENT_CLASSIFICATION_WORKER_ENABLED === "true",
    followUp: process.env.IR_FOLLOW_UP_WORKER_ENABLED === "true",
    inWindowNudge: process.env.IR_INWINDOW_NUDGE_ENABLED === "true",
  },
};

/** Call at boot in production to fail fast on missing secrets. */
export function assertProductionSecrets(): void {
  if (config.env !== "production") return;
  requiredInProd("IR_SUPABASE_URL");
  requiredInProd("IR_SUPABASE_SERVICE_ROLE_KEY");
  requiredInProd("IR_META_VERIFY_TOKEN");
  requiredInProd("IR_META_APP_SECRET");
  requiredInProd("IR_META_WHATSAPP_TOKEN");
  requiredInProd("IR_META_PHONE_NUMBER_ID");
}
