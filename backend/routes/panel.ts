import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  getConversationById,
  insertMessage,
  listConversations,
  listMessagesForPanel,
  touchConversation,
} from "../db/conversations.js";
import { listDocumentsForCase } from "../db/cases.js";
import { listCases, listLeads } from "../db/leads.js";
import { config } from "../config.js";
import {
  headerTokenMatches,
  readSession,
} from "../services/panel-session.js";
import { REQUIRED_DOCUMENT_TYPES } from "../services/documents.js";
import {
  isMetaGraphConfigured,
  isMetaWhatsAppConfigured,
  sendWhatsAppMedia,
  sendWhatsAppText,
} from "../services/meta-graph.js";
import { isOpenAiConfigured } from "../services/openai-agent.js";
import { isSupabaseConfigured } from "../services/supabase.js";
import {
  queueTestOutreach,
  sendTestDripTemplate,
} from "../services/test-outreach.js";
import { importWhatsAppCsv } from "../services/whatsapp-csv-import.js";
import { decideReheat } from "../services/reheat-decision.js";
import { runReheatBatch } from "../services/reheat-scorer.js";

const router = Router();

function requirePanelAuth(req: Request, res: Response, next: NextFunction) {
  const session = readSession(req);
  if (session?.role === "panel") {
    next();
    return;
  }
  if (headerTokenMatches(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
}

router.use(requirePanelAuth);

router.get("/status", (_req, res) => {
  res.json({
    supabase: isSupabaseConfigured(),
    metaWhatsApp: isMetaWhatsAppConfigured(),
    metaGraph: isMetaGraphConfigured(),
    openai: isOpenAiConfigured(),
    templateWorker: config.workers.template,
    followUpWorker: config.workers.followUp,
    inWindowNudgeWorker: config.workers.inWindowNudge,
    templateInitial: Boolean(config.meta.templateInitial),
    templateTrust: Boolean(config.meta.templateTrust),
    templateExplain: Boolean(config.meta.templateExplain),
    publicApiUrl: config.publicApiUrl,
    webhookWhatsapp: `${config.publicApiUrl}/api/ir/webhooks/whatsapp`,
    webhookLeadAds: `${config.publicApiUrl}/api/ir/webhooks/meta-leads`,
    env: config.env,
  });
});

router.get("/leads", async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      res.json({ leads: [], configured: false });
      return;
    }
    const leads = await listLeads();
    res.json({ leads, configured: true });
  } catch (err) {
    console.error("[panel/leads]", err);
    res.status(500).json({ error: "failed_to_list_leads" });
  }
});

router.get("/cases", async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      res.json({ cases: [], configured: false });
      return;
    }
    const cases = await listCases();
    res.json({ cases, configured: true });
  } catch (err) {
    console.error("[panel/cases]", err);
    res.status(500).json({ error: "failed_to_list_cases" });
  }
});

/** Stub até job de reheat: lista vazia ou scores se tabela existir */
router.get("/reheat", async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      res.json({ items: [], configured: false, note: "supabase_off" });
      return;
    }
    const db = (await import("../services/supabase.js")).getSupabaseAdmin();
    if (!db) {
      res.json({ items: [], configured: false });
      return;
    }
    const { data, error } = await db
      .from("ir_reheat_scores")
      .select("*")
      .order("score", { ascending: false })
      .limit(100);
    if (error) {
      // tabela ainda não criada
      res.json({
        items: [],
        configured: true,
        note: error.message.includes("ir_reheat")
          ? "run_migration_0002"
          : error.message,
      });
      return;
    }
    res.json({ items: data ?? [], configured: true });
  } catch (err) {
    console.error("[panel/reheat]", err);
    res.status(500).json({ error: "failed_to_list_reheat" });
  }
});

router.get("/imports", async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      res.json({ imports: [], configured: false });
      return;
    }
    const db = (await import("../services/supabase.js")).getSupabaseAdmin();
    if (!db) {
      res.json({ imports: [], configured: false });
      return;
    }
    const { data, error } = await db
      .from("ir_whatsapp_imports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      res.json({
        imports: [],
        configured: true,
        note: "run_migration_0002",
      });
      return;
    }
    res.json({ imports: data ?? [], configured: true });
  } catch (err) {
    console.error("[panel/imports]", err);
    res.status(500).json({ error: "failed_to_list_imports" });
  }
});

/** CSV: body { filename, csvText } — colunas phone,name,last_message,last_message_at,notes */
router.post("/imports", async (req, res) => {
  try {
    const filename = String(req.body?.filename ?? "upload.csv");
    const csvText = String(req.body?.csvText ?? "");
    if (!csvText.trim()) {
      res.status(400).json({ error: "missing_csvText" });
      return;
    }
    const result = await importWhatsAppCsv({
      filename,
      csvText,
      uploadedBy: "panel",
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[panel/imports POST]", err);
    res.status(400).json({
      error: err instanceof Error ? err.message : "import_failed",
    });
  }
});

router.post("/reheat/run", async (req, res) => {
  try {
    const limit = Math.min(Number(req.body?.limit ?? 50) || 50, 200);
    const result = await runReheatBatch(limit);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[panel/reheat/run]", err);
    res.status(500).json({ error: "reheat_failed" });
  }
});

router.post("/reheat/:id/decide", async (req, res) => {
  try {
    const decision = String(req.body?.decision ?? "");
    if (decision !== "approved" && decision !== "rejected") {
      res.status(400).json({ error: "decision_must_be_approved_or_rejected" });
      return;
    }
    const result = await decideReheat({
      id: String(req.params.id),
      decision,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "decide_failed";
    const status =
      msg === "reheat_not_found"
        ? 404
        : msg === "already_decided" || msg === "cannot_approve_skip"
          ? 409
          : 400;
    console.error("[panel/reheat/decide]", msg);
    res.status(status).json({ error: msg });
  }
});

router.get("/conversations", async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      res.json({ conversations: [], configured: false });
      return;
    }
    const conversations = await listConversations();
    res.json({ conversations, configured: true });
  } catch (err) {
    console.error("[panel/conversations]", err);
    res.status(500).json({ error: "failed_to_list_conversations" });
  }
});

/** Documentos do caso ligado à conversa + pendências do checklist. */
router.get("/conversations/:id/documents", async (req, res) => {
  try {
    const db = (await import("../services/supabase.js")).getSupabaseAdmin();
    if (!db) {
      res.json({ documents: [], missing: [], configured: false });
      return;
    }

    const { data: irCase } = await db
      .from("ir_cases")
      .select("id, status, missing_information")
      .eq("conversation_id", String(req.params.id))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!irCase) {
      res.json({
        documents: [],
        missing: [...REQUIRED_DOCUMENT_TYPES],
        caseStatus: null,
      });
      return;
    }

    const documents = await listDocumentsForCase(irCase.id);
    const missing =
      (irCase.missing_information as { missing_documents?: string[] } | null)
        ?.missing_documents ?? [];

    res.json({
      documents,
      missing,
      caseStatus: irCase.status,
      caseId: irCase.id,
    });
  } catch (err) {
    console.error("[panel/documents]", err);
    res.status(500).json({ error: "failed_to_list_documents" });
  }
});

/** URL assinada de curta duração — documentos não são públicos. */
router.get("/documents/:id/url", async (req, res) => {
  try {
    const db = (await import("../services/supabase.js")).getSupabaseAdmin();
    if (!db) {
      res.status(400).json({ error: "supabase_off" });
      return;
    }

    const { data: doc, error } = await db
      .from("ir_documents")
      .select("storage_bucket, storage_path")
      .eq("id", String(req.params.id))
      .maybeSingle();

    if (error || !doc?.storage_path) {
      res.status(404).json({ error: "document_not_found" });
      return;
    }

    const signed = await db.storage
      .from(doc.storage_bucket ?? config.supabase.documentsBucket)
      .createSignedUrl(doc.storage_path, 300);

    if (signed.error || !signed.data) {
      res.status(500).json({ error: signed.error?.message ?? "sign_failed" });
      return;
    }

    res.json({ url: signed.data.signedUrl, expiresInSeconds: 300 });
  } catch (err) {
    console.error("[panel/documents/url]", err);
    res.status(500).json({ error: "failed_to_sign_url" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const messages = await listMessagesForPanel(String(req.params.id));
    res.json({ messages });
  } catch (err) {
    console.error("[panel/conversations/messages]", err);
    res.status(500).json({ error: "failed_to_list_messages" });
  }
});

/** Takeover humano — pausa agente (status waiting_human). */
router.post("/conversations/:id/takeover", async (req, res) => {
  try {
    await touchConversation(String(req.params.id), {
      status: "waiting_human",
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[panel/takeover]", err);
    res.status(500).json({ error: "takeover_failed" });
  }
});

router.post("/conversations/:id/resume", async (req, res) => {
  try {
    await touchConversation(String(req.params.id), {
      status: "qualifying",
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[panel/resume]", err);
    res.status(500).json({ error: "resume_failed" });
  }
});

/** Reply humano na janela 24h. Fora da janela a Meta recusa — use template de reheat. */
router.post("/conversations/:id/reply", async (req, res) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (!text) {
      res.status(400).json({ error: "missing_text" });
      return;
    }
    const conversation = await getConversationById(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }

    const sent = await sendWhatsAppText({
      toE164: conversation.phone,
      text,
    });
    if (!sent.ok) {
      res.status(400).json({ error: sent.error });
      return;
    }

    await insertMessage({
      conversationId: conversation.id,
      role: "human",
      text,
      messageType: "text",
      externalMessageId: sent.externalMessageId,
      deliveryStatus: "sent",
    });
    await touchConversation(conversation.id, {
      status: "waiting_human",
      lastOutbound: true,
    });
    res.json({ ok: true, externalMessageId: sent.externalMessageId });
  } catch (err) {
    console.error("[panel/reply]", err);
    res.status(500).json({ error: "reply_failed" });
  }
});

/** Envio humano de áudio, imagem, vídeo ou documento na janela 24h. */
router.post("/conversations/:id/media", async (req, res) => {
  try {
    const filename = String(req.body?.filename ?? "").trim();
    const mimeType = String(req.body?.mimeType ?? "").trim();
    const base64 = String(req.body?.base64 ?? "").trim();
    const caption = String(req.body?.caption ?? "").trim();
    if (!filename || !mimeType || !base64) {
      res.status(400).json({ error: "missing_media" });
      return;
    }
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.byteLength || buffer.byteLength > 3_800_000) {
      res.status(400).json({ error: "media_too_large" });
      return;
    }
    const conversation = await getConversationById(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }

    const sent = await sendWhatsAppMedia({
      toE164: conversation.phone,
      buffer,
      filename,
      mimeType,
      caption: caption || undefined,
    });
    if (!sent.ok) {
      res.status(400).json({ error: sent.error });
      return;
    }

    await insertMessage({
      conversationId: conversation.id,
      role: "human",
      text: caption || `[arquivo: ${filename}]`,
      messageType: sent.messageType,
      externalMessageId: sent.externalMessageId,
      deliveryStatus: "sent",
    });
    await touchConversation(conversation.id, {
      status: "waiting_human",
      lastOutbound: true,
    });
    res.json({
      ok: true,
      externalMessageId: sent.externalMessageId,
      messageType: sent.messageType,
    });
  } catch (err) {
    console.error("[panel/media]", err);
    res.status(500).json({ error: "media_failed" });
  }
});

/** Dispara `contato_inicial` no número informado (teste no celular pessoal). */
router.post("/test-outreach", async (req, res) => {
  try {
    const result = await queueTestOutreach({
      phone: String(req.body?.phone ?? ""),
      name: String(req.body?.name ?? ""),
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[panel/test-outreach]", err);
    res.status(500).json({ error: "test_outreach_failed" });
  }
});

/** Dispara na hora o template de recuperação (24h / explica). */
router.post("/test-drip", async (req, res) => {
  try {
    const which = String(req.body?.which ?? "trust") === "explain" ? "explain" : "trust";
    const result = await sendTestDripTemplate({
      phone: String(req.body?.phone ?? ""),
      name: String(req.body?.name ?? ""),
      which,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[panel/test-drip]", err);
    res.status(500).json({ error: "test_drip_failed" });
  }
});

export default router;
