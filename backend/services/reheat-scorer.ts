import OpenAI from "openai";
import { config } from "../config.js";
import { getSupabaseAdmin } from "./supabase.js";
import { isOpenAiConfigured } from "./openai-agent.js";

export type ReheatAction = "reheat" | "reanalyze" | "skip" | "needs_human";

function heuristicScore(input: {
  lastMessage?: string | null;
  lastInboundAt?: string | null;
  status?: string | null;
}): { score: number; action: ReheatAction; reasons: string[] } {
  const reasons: string[] = [];
  let score = 40;
  const text = (input.lastMessage ?? "").toLowerCase();
  const days = input.lastInboundAt
    ? (Date.now() - new Date(input.lastInboundAt).getTime()) / 86400000
    : 999;

  if (
    text.includes("parar") ||
    text.includes("não quero") ||
    text.includes("nao quero") ||
    text.includes("golpe")
  ) {
    return { score: 5, action: "skip", reasons: ["opt_out_or_fraud_fear"] };
  }
  if (text.includes("documento") || text.includes("cnis") || text.includes("rg")) {
    score += 25;
    reasons.push("mentioned_documents");
  }
  if (text.includes("humano") || text.includes("advogado")) {
    return {
      score: 55,
      action: "needs_human",
      reasons: ["asked_human"],
    };
  }
  if (days <= 30) {
    score += 20;
    reasons.push("recent_activity");
  } else if (days > 90) {
    score -= 15;
    reasons.push("stale_90d");
  }
  if (input.status === "waiting_documents" || text.includes("envio")) {
    score += 20;
    reasons.push("docs_in_progress");
    return {
      score: Math.min(100, score),
      action: "reanalyze",
      reasons,
    };
  }

  const action: ReheatAction =
    score >= 60 ? "reheat" : score >= 35 ? "reheat" : "skip";
  return { score: Math.max(0, Math.min(100, score)), action, reasons };
}

async function llmRefine(input: {
  phone: string;
  lastMessage?: string | null;
  heuristic: ReturnType<typeof heuristicScore>;
}): Promise<ReturnType<typeof heuristicScore> | null> {
  if (!isOpenAiConfigured()) return null;
  const client = new OpenAI({ apiKey: config.openai.apiKey });
  try {
    const completion = await client.chat.completions.create({
      model: config.openai.reheatModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Analise friamente lead de Restituição INSS (IR Consultoria). JSON: {score:0-100, action:reheat|reanalyze|skip|needs_human, reasons:string[]}. Nunca incentive spam. Opt-out/golpe → skip.",
        },
        {
          role: "user",
          content: JSON.stringify({
            phone: input.phone,
            lastMessage: input.lastMessage,
            heuristic: input.heuristic,
          }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      score?: number;
      action?: ReheatAction;
      reasons?: string[];
    };
    if (!parsed.action || parsed.score == null) return null;
    return {
      score: Number(parsed.score),
      action: parsed.action,
      reasons: parsed.reasons ?? [],
    };
  } catch (err) {
    console.error("[reheat] llm", err);
    return null;
  }
}

/** Pontua conversas importadas sem score recente. */
export async function runReheatBatch(limit = 50): Promise<{ scored: number }> {
  const db = getSupabaseAdmin();
  if (!db) return { scored: 0 };

  const { data: conversations, error } = await db
    .from("ir_conversations")
    .select("id, phone, status, last_inbound_at, source")
    .or("source.eq.import,status.eq.closed,status.eq.waiting_documents")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[reheat] list conversations", error.message);
    return { scored: 0 };
  }

  let scored = 0;
  for (const conv of conversations ?? []) {
    const { data: lastMsg } = await db
      .from("ir_messages")
      .select("text")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let result = heuristicScore({
      lastMessage: lastMsg?.text,
      lastInboundAt: conv.last_inbound_at,
      status: conv.status,
    });
    const refined = await llmRefine({
      phone: conv.phone,
      lastMessage: lastMsg?.text,
      heuristic: result,
    });
    if (refined) result = refined;

    const { error: upErr } = await db.from("ir_reheat_scores").insert({
      conversation_id: conv.id,
      phone: conv.phone,
      score: result.score,
      action: result.action,
      reasons: result.reasons,
      model: refined ? config.openai.reheatModel : "heuristic",
      human_decision: "pending",
      suggested_opener:
        result.action === "reheat" || result.action === "reanalyze"
          ? "Podemos retomar com calma a análise de indício de restituição do INSS?"
          : null,
    });
    if (upErr) {
      console.error("[reheat] insert", upErr.message);
      continue;
    }
    scored++;
  }

  return { scored };
}
