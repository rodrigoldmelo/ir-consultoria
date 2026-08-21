import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import OpenAI from "openai";
import { config } from "../config.js";

export function isOpenAiConfigured(): boolean {
  return Boolean(config.openai.apiKey);
}

const FALLBACK_PROMPT = `Você é o assistente da IR Consultoria Contábil e Previdenciária no WhatsApp.
Missão: qualificar com confiança e coletar documentos para análise de indício de direito à Restituição do INSS.
Decisão e cálculo finais são humanos — nunca garanta restituição nem valores.
Restituição INSS ≠ restituição de Imposto de Renda.
Não peça senha Gov.br, PIX antecipado, cartão nem “taxa para liberar”.
Sem agendar reunião, Meet ou Calendar.
Uma pergunta por vez. Nunca abra com “Como posso ajudar você hoje?”.
Se o lead iniciar sem nome, cumprimente, apresente a IR e só então peça o primeiro nome.
Qualificação curta: a pergunta central é se trabalhou ao mesmo tempo em duas ou mais instituições.`;

function readNearby(relativeFromRepo: string): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), relativeFromRepo),
    resolve(here, "../..", relativeFromRepo),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, "utf8").trim();
    }
  }
  return null;
}

/** Relê os markdowns a cada chamada para edição local sem rebuild. */
export function loadAgentSystemPrompt(): string {
  const brain = readNearby("prompts/agent-system-prompt.md");
  const qualification = readNearby("docs/QUALIFICATION_QUESTIONS.md");
  const parts = [brain || FALLBACK_PROMPT];
  if (qualification) {
    parts.push("## Perguntas de qualificação (usar uma por vez)\n\n" + qualification);
  }
  return parts.join("\n\n");
}

function enforceNeutralHonorific(text: string, honorific?: string | null): string {
  if (!honorific) return text;
  const firstName = honorific.replace(/^Dr\(a\)\.\s*/i, "").trim();
  if (!firstName) return text;
  const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`\\bDr\\.\\s+${escaped}\\b`, "g"), `Dr(a). ${firstName}`)
    .replace(new RegExp(`\\bDra\\.\\s+${escaped}\\b`, "g"), `Dr(a). ${firstName}`)
    .replace(new RegExp(`\\bDoutor\\s+${escaped}\\b`, "gi"), `Dr(a). ${firstName}`)
    .replace(new RegExp(`\\bDoutora\\s+${escaped}\\b`, "gi"), `Dr(a). ${firstName}`)
    .replace(
      new RegExp(`\\b(Olá|Entendi|Perfeito|Certo|Joia|Obrigado|Obrigada|Que bom),\\s+${escaped}\\b`, "gi"),
      (_match, prefix: string) => `${prefix}, Dr(a). ${firstName}`,
    );
}

function normalized(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function looksLikeKnowledgeYes(text: string): boolean {
  const t = normalized(text);
  return (
    t.includes("ja tinha") ||
    t.includes("ja ouvi") ||
    t.includes("ja conhe") ||
    t.includes("ouvi falar") ||
    t.includes("por alto") ||
    t.includes("conheco")
  );
}

function looksLikeKnowledgeNo(text: string): boolean {
  const t = normalized(text);
  return (
    t.includes("nunca ouvi") ||
    t.includes("nao conhe") ||
    t.includes("nao tinha") ||
    t.includes("nunca tinha") ||
    t.includes("primeira vez")
  );
}

function isShortYes(text: string): boolean {
  const t = normalized(text).trim();
  return ["sim", "s", "isso", "trabalhei", "ja"].includes(t) || t.startsWith("sim ");
}

function isShortNo(text: string): boolean {
  const t = normalized(text).trim();
  return ["nao", "n", "nunca"].includes(t) || t.startsWith("nao ");
}

function askedEssentialQuestion(text?: string | null): boolean {
  const t = normalized(text ?? "");
  return (
    t.includes("duas ou mais instituicoes") ||
    t.includes("mais de uma instituicao") ||
    t.includes("ao mesmo tempo") ||
    t.includes("hospitais, clinicas")
  );
}

function statesMultipleLinks(text: string): boolean {
  const t = normalized(text);
  const hasTwoRegimes =
    (t.includes("clt") && t.includes("pj")) ||
    (t.includes("hospital") && t.includes("clinica")) ||
    (t.includes("hospital") && t.includes("cooperativa")) ||
    (t.includes("clinica") && t.includes("cooperativa"));
  return (
    hasTwoRegimes ||
    t.includes("duas instituicoes") ||
    t.includes("duas ou mais") ||
    t.includes("mais de uma fonte") ||
    t.includes("mais de um vinculo")
  );
}

function askedKnowledgeQuestion(text?: string | null): boolean {
  const t = normalized(text ?? "");
  return (
    t.includes("ja tinha conhecimento") ||
    t.includes("ja conhecia") ||
    t.includes("conhecimento sobre") ||
    t.includes("conhecia esse assunto")
  );
}

export async function generateAgentReply(input: {
  userText: string;
  history: Array<{ role: string; text: string | null }>;
  honorific?: string | null;
  needsName?: boolean;
  briefingDone?: boolean;
  leadContext?: string | null;
}): Promise<string | null> {
  if (!isOpenAiConfigured()) return null;

  const client = new OpenAI({ apiKey: config.openai.apiKey });
  const turn: string[] = [];
  if (input.honorific) {
    turn.push(`Tratamento obrigatório neste turno: ${input.honorific} (não use só o primeiro nome).`);
  } else if (input.needsName) {
    turn.push(
      "Nome ainda desconhecido. Cumprimente com naturalidade, apresente a IR Consultoria em uma frase e pergunte o primeiro nome. Não mande apenas 'Como prefere que eu te chame?'. Depois disso, sempre Dr(a). {Nome}.",
    );
  }
  if (!input.briefingDone && !input.needsName) {
    turn.push(
      "Ainda não explicou a Restituição do INSS nesta conversa. Cumprimente, apresente a IR em uma frase, explique em 1-2 frases e pergunte se o lead já conhecia. Não avance para a pergunta de vínculos neste turno.",
    );
  }
  if (input.leadContext) {
    turn.push(input.leadContext);
  }

  const history = input.history.filter((m) => m.text);
  const lastAssistant = [...history].reverse().find((m) => m.role !== "user");
  if (askedKnowledgeQuestion(lastAssistant?.text) && isShortYes(input.userText)) {
    turn.push(
      "A pergunta anterior foi se o lead já conhecia o assunto, e ele respondeu SIM. Não explique novamente. Vá direto para a pergunta essencial sobre trabalhar ao mesmo tempo em duas ou mais instituições.",
    );
  } else if (askedKnowledgeQuestion(lastAssistant?.text) && isShortNo(input.userText)) {
    turn.push(
      "A pergunta anterior foi se o lead já conhecia o assunto, e ele respondeu NÃO. Explique de forma objetiva e termine com a pergunta essencial sobre trabalhar ao mesmo tempo em duas ou mais instituições. Não encerre a conversa.",
    );
  } else if (askedEssentialQuestion(lastAssistant?.text) && isShortYes(input.userText)) {
    turn.push(
      "O lead respondeu SIM para a pergunta essencial de múltiplos vínculos. Não faça mais perguntas de triagem. Peça o CNIS de forma curta e diga que enviará o passo a passo.",
    );
  } else if (askedEssentialQuestion(lastAssistant?.text) && isShortNo(input.userText)) {
    turn.push(
      "O lead respondeu NÃO para a pergunta essencial de múltiplos vínculos. Diga que esse é o perfil mais comum e que a chance reduz, mas sem parecer definitivo; peça o CNIS para uma triagem inicial e diga que enviará o passo a passo.",
    );
  } else if (statesMultipleLinks(input.userText)) {
    turn.push(
      "O lead já informou no próprio texto múltiplos vínculos ou fontes pagadoras. Não repita a pergunta essencial. Responda em até 2 frases e peça o CNIS como próximo passo, dizendo que enviará o passo a passo.",
    );
  } else if (looksLikeKnowledgeYes(input.userText)) {
    turn.push(
      "O lead respondeu que já conhecia ou já tinha ouvido falar. Responda sem explicar novamente. Use no máximo 2 frases e faça diretamente a pergunta essencial: 'Nos últimos anos, você trabalhou ao mesmo tempo em duas ou mais instituições (hospitais, clínicas, cooperativas ou órgãos públicos)?'",
    );
  } else if (looksLikeKnowledgeNo(input.userText)) {
    turn.push(
      "O lead respondeu que não conhece o assunto. Explique em poucas frases, sem juridiquês, e termine diretamente com a pergunta essencial sobre ter trabalhado ao mesmo tempo em duas ou mais instituições.",
    );
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: loadAgentSystemPrompt() },
  ];
  if (turn.length) {
    messages.push({ role: "system", content: turn.join(" ") });
  }
  const last = history[history.length - 1];
  const historyWithoutDup =
    last?.role === "user" && last.text?.trim() === input.userText.trim()
      ? history.slice(0, -1)
      : history;

  for (const m of historyWithoutDup) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.text as string });
    } else if (m.role === "assistant" || m.role === "human") {
      messages.push({ role: "assistant", content: m.text as string });
    }
  }

  messages.push({ role: "user", content: input.userText });

  try {
    const completion = await client.chat.completions.create({
      model: config.openai.model,
      temperature: 0.35,
      max_tokens: 320,
      messages,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text ? enforceNeutralHonorific(text, input.honorific) : null;
  } catch (err) {
    console.error("[openai] generateAgentReply", err);
    return null;
  }
}

/** Primeiro aceite do template: saudação + explicação curta + conhecimento. */
export async function generateFirstContactReply(input: {
  userText: string;
  firstName?: string | null;
  leadContext?: string | null;
}): Promise<string | null> {
  if (!isOpenAiConfigured()) return null;

  const honorific = input.firstName ? `Dr(a). ${input.firstName}` : null;
  const nameHint = honorific
    ? `Comece com "Olá, ${honorific}, tudo bem?".`
    : "Nome desconhecido: cumprimente, apresente a IR em uma frase e pergunte o primeiro nome. Não avance para conhecimento ou vínculos.";

  const client = new OpenAI({ apiKey: config.openai.apiKey });
  try {
    const completion = await client.chat.completions.create({
      model: config.openai.model,
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: `Você escreve a PRIMEIRA mensagem da IR Consultoria no WhatsApp após o lead aceitar o template. ${nameHint}
Contexto do cadastro, quando existir: ${input.leadContext ?? "não informado"}.
Obrigatório se o nome já for conhecido:
- saudação humana: "Olá, Dr(a). Nome, tudo bem?";
- dizer que é da IR Consultoria, assessoria especializada em Restituição do INSS para médicos;
- explicar em 1 frase: pode existir INSS pago a mais quando o médico trabalhou por mais de uma fonte no mesmo período; não é restituição de Imposto de Renda; análise não garante valor;
- perguntar se o lead já tinha conhecimento sobre o assunto (única pergunta).
- Formate como WhatsApp humano: blocos curtos separados por uma linha em branco. Estrutura preferida: saudação; apresentação; explicação objetiva; pergunta.
Obrigatório se o nome NÃO for conhecido:
- saudação humana + apresentação curta da IR;
- perguntar o primeiro nome;
- não pergunte se conhecia ainda.
Não avance para perguntas de vínculo neste turno.
Não peça nome, telefone ou email se já vieram no contexto do cadastro.
Máximo 520 caracteres. Frases curtas. Sem parágrafo corrido, valor, prazo, senha, reunião, “como posso ajudar”.`,
        },
        { role: "user", content: input.userText },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return null;
    const normalized = enforceNeutralHonorific(text, honorific);
    return normalized.length > 520 ? `${normalized.slice(0, 517)}…` : normalized;
  } catch (err) {
    console.error("[openai] generateFirstContactReply", err);
    return null;
  }
}
