/**
 * Tratamento e abertura após aceite do template inicial `contato_inicial`.
 */
const TITLES = /^(dr\.?a?|dra\.?|doutor|doutora)\s+/i;

const NAME_BLOCKLIST = new Set([
  "sim",
  "nao",
  "não",
  "oi",
  "ola",
  "olá",
  "ok",
  "clt",
  "pj",
  "cnis",
  "inss",
  "medico",
  "médico",
  "medica",
  "médica",
  "cooperativa",
  "hospital",
  "clinica",
  "clínica",
  "isso",
  "mesmo",
  "agora",
  "claro",
  "perfeito",
  "gostaria",
  "analise",
  "análise",
  "gratuita",
  "lembro",
  "certeza",
  "obrigado",
  "obrigada",
]);

export function firstNameFromLead(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const withoutTitle = trimmed.replace(TITLES, "");
  const token = withoutTitle.split(/\s+/)[0] ?? "";
  const cleaned = token.replace(/[^A-Za-zÀ-ÿ'-]/g, "");
  if (cleaned.length < 2) return null;
  if (NAME_BLOCKLIST.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

/** Sempre Dr(a). + primeiro nome. Não inventar Dr. vs Dra. */
export function honorificName(name: string | null | undefined): string | null {
  const first = firstNameFromLead(name);
  return first ? `Dr(a). ${first}` : null;
}

export function extractGivenName(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const labeled = raw.match(
    /(?:meu nome [ée]|me chamo|pode me chamar de|me chama(?:r)? de|sou (?:o|a))\s+([A-Za-zÀ-ÿ]{2,})/i,
  );
  if (labeled?.[1]) {
    return firstNameFromLead(labeled[1]);
  }
  const words = raw.replace(/[.,!?]/g, " ").trim().split(/\s+/);
  if (words.length === 1) {
    return firstNameFromLead(words[0]);
  }
  return null;
}

/** Aceite do template: botão Sim / equivalentes. Não cobre opt-out. */
export function isTemplateAccept(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (
    t.includes("golpe") ||
    t.includes("senha") ||
    t.includes("gov.br") ||
    t.includes("humano")
  ) {
    return false;
  }
  return (
    t === "sim" ||
    t === "s" ||
    t.startsWith("sim") ||
    t.includes("quero fazer a análise") ||
    t.includes("quero fazer a analise") ||
    t.includes("quero a análise") ||
    t.includes("vamos") ||
    t.includes("pode ser") ||
    t.includes("pode sim") ||
    t.includes("posso") ||
    t.includes("pode fazer") ||
    t.includes("autorizo") ||
    t.includes("tudo bem") ||
    t.includes("ok") ||
    t.includes("quero continuar") ||
    t.includes("quero entender")
  );
}

export function renderPostTemplateBriefing(name?: string | null): string {
  const who = honorificName(name);
  const core =
    "Aqui é da IR Consultoria, assessoria especializada em Restituição do INSS para médicos. Pode existir INSS pago a mais quando há mais de uma fonte no mesmo período; não é restituição de Imposto de Renda e não há garantia de valor.";
  if (!who) {
    return `Olá, tudo bem? ${core} Para eu te atender melhor, como prefere que eu te chame?`;
  }
  return `Olá, ${who}, tudo bem? ${core} Já tinha conhecimento sobre esse assunto?`;
}
