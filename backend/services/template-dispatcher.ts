import { config } from "../config.js";
import { sendWhatsAppTemplate } from "./meta-graph.js";
import type { TemplateDispatchResult } from "../types/index.js";

/**
 * Dispara template WhatsApp Cloud API (real quando credenciais presentes).
 * Só template aprovado; sem free-text antes da 1ª resposta do lead.
 */
export async function dispatchInitialTemplate(input: {
  phoneE164: string;
  leadName?: string;
  metaLeadgenId: string;
}): Promise<TemplateDispatchResult> {
  const { templateInitial, templateLanguage } = config.meta;

  const bodyParameters =
    input.leadName && input.leadName.trim()
      ? [input.leadName.trim()]
      : undefined;

  const result = await sendWhatsAppTemplate({
    toE164: input.phoneE164,
    templateName: templateInitial || "contato_inicial",
    languageCode: templateLanguage,
    bodyParameters,
  });

  if (!result.ok) {
    console.error("[template-dispatcher] send failed", {
      metaLeadgenId: input.metaLeadgenId,
      error: result.error,
      permanent: result.permanent,
    });
    return {
      ok: false,
      permanent: result.permanent,
      error: result.error,
    };
  }

  console.info("[template-dispatcher] sent", {
    metaLeadgenId: input.metaLeadgenId,
    externalMessageId: result.externalMessageId,
  });

  return { ok: true, externalMessageId: result.externalMessageId };
}
