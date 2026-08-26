import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  deleteMessageForPanel,
  getConversationById,
  getMessageForConversation,
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
import {
  REQUIRED_DOCUMENT_TYPES,
  storePanelOutboundMedia,
} from "../services/documents.js";
import {
  isMetaGraphConfigured,
  isMetaWhatsAppConfigured,
  sendWhatsAppMedia,
  sendWhatsAppReaction,
  sendWhatsAppText,
} from "../services/meta-graph.js";
import { isOpenAiConfigured } from "../services/openai-agent.js";
import { isSupabaseConfigured } from "../services/supabase.js";
import {
  queueConversationInitialOutreach,
  queueLeadInitialOutreach,
  queueTestOutreach,
  sendTestDripTemplate,
} from "../services/test-outreach.js";
import { importWhatsAppCsv } from "../services/whatsapp-csv-import.js";
import { queueInitialOutreachBatch } from "../services/outreach-batch.js";
import {
  sendManualFollowUp,
  type ManualFollowUpType,
} from "../services/manual-follow-up.js";
import { syncConversationToAdvbox } from "../services/advbox.js";
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
    templateCnisReminder: Boolean(config.meta.templateCnisReminder),
    templateContinueAnalysis: Boolean(config.meta.templateContinueAnalysis),
    templateResumeAnalysis: Boolean(config.meta.templateResumeAnalysis),
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

router.post("/leads/:id/outreach", async (req, res) => {
  try {
    const result = await queueLeadInitialOutreach({
      leadId: String(req.params.id ?? ""),
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[panel/lead-outreach]", err);
    res.status(500).json({ error: "lead_outreach_failed" });
  }
});

router.post("/conversations/:id/outreach", async (req, res) => {
  try {
    const result = await queueConversationInitialOutreach({
      conversationId: String(req.params.id ?? ""),
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[panel/conversation-outreach]", err);
    res.status(500).json({ error: "conversation_outreach_failed" });
  }
});

router.post("/outreach/batch", async (req, res) => {
  try {
    const recipients = Array.isArray(req.body?.recipients)
      ? req.body.recipients.slice(0, 500)
      : [];
    if (!recipients.length) {
      res.status(400).json({ error: "missing_recipients" });
      return;
    }
    const result = await queueInitialOutreachBatch({ recipients });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[panel/outreach-batch]", err);
    res.status(500).json({ error: "outreach_batch_failed" });
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
      .select("id, status, missing_information, advbox_client_id, advbox_case_id, advbox_task_id, assigned_to")
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
      advbox: {
        clientId: irCase.advbox_client_id ?? null,
        caseId: irCase.advbox_case_id ?? null,
        taskId: irCase.advbox_task_id ?? null,
        assignedTo: irCase.assigned_to ?? null,
      },
    });
  } catch (err) {
    console.error("[panel/documents]", err);
    res.status(500).json({ error: "failed_to_list_documents" });
  }
});

router.post("/conversations/:id/advbox-sync", async (req, res) => {
  try {
    const cpf = String(req.body?.cpf ?? "").trim();
    const result = await syncConversationToAdvbox({
      conversationId: String(req.params.id),
      cpf: cpf || null,
    });
    if (!result.ok) {
      const status =
        result.error === "conversation_not_found" || result.error === "case_not_found"
          ? 404
          : result.error === "cpf_required" ||
              result.error === "invalid_cpf" ||
              result.error === "missing_required_documents" ||
              result.error.startsWith("missing_env:")
            ? 400
            : 502;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[panel/advbox-sync]", err);
    res.status(500).json({ ok: false, error: "advbox_sync_failed" });
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

router.post("/conversations/:id/follow-up", async (req, res) => {
  try {
    const rawType = String(req.body?.type ?? "");
    const allowed: ManualFollowUpType[] = [
      "cnis_reminder",
      "continue_analysis",
      "resume_analysis",
    ];
    if (!allowed.includes(rawType as ManualFollowUpType)) {
      res.status(400).json({ error: "invalid_follow_up_type" });
      return;
    }
    const result = await sendManualFollowUp({
      conversationId: String(req.params.id),
      type: rawType as ManualFollowUpType,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[panel/follow-up]", err);
    res.status(500).json({ error: "follow_up_failed" });
  }
});

/** Reply humano na janela 24h. Fora da janela a Meta recusa — use template de reheat. */
router.post("/conversations/:id/reply", async (req, res) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    const replyToMessageId = String(req.body?.replyToMessageId ?? "").trim();
    if (!text) {
      res.status(400).json({ error: "missing_text" });
      return;
    }
    const conversation = await getConversationById(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }

    const operator = config.panelOperatorName.trim();
    const outboundText =
      operator && !text.toLowerCase().startsWith(`${operator.toLowerCase()}:`)
        ? `*${operator}:*\n${text}`
        : text;
    const quoted = replyToMessageId
      ? await getMessageForConversation(conversation.id, replyToMessageId)
      : null;
    const sent = await sendWhatsAppText({
      toE164: conversation.phone,
      text: outboundText,
      contextMessageId: quoted?.external_message_id ?? null,
    });
    if (!sent.ok) {
      res.status(400).json({ error: sent.error });
      return;
    }

    await insertMessage({
      conversationId: conversation.id,
      role: "human",
      text: outboundText,
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
    const replyToMessageId = String(req.body?.replyToMessageId ?? "").trim();
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

    const quoted = replyToMessageId
      ? await getMessageForConversation(conversation.id, replyToMessageId)
      : null;
    const operator = config.panelOperatorName.trim();
    const outboundCaption =
      caption && operator && !caption.toLowerCase().startsWith(`${operator.toLowerCase()}:`)
        ? `*${operator}:*\n${caption}`
        : caption;
    const sent = await sendWhatsAppMedia({
      toE164: conversation.phone,
      buffer,
      filename,
      mimeType,
      caption: outboundCaption || undefined,
      contextMessageId: quoted?.external_message_id ?? null,
    });
    if (!sent.ok) {
      res.status(400).json({ error: sent.error });
      return;
    }

    const messageId = await insertMessage({
      conversationId: conversation.id,
      role: "human",
      text: outboundCaption || `[arquivo: ${filename}]`,
      messageType: sent.messageType,
      externalMessageId: sent.externalMessageId,
      deliveryStatus: "sent",
    });
    if (messageId) {
      await storePanelOutboundMedia({
        conversationId: conversation.id,
        leadId: conversation.lead_id,
        buffer,
        filename,
        mimeType,
        sourceMessageId: messageId,
      });
    }
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

router.post("/conversations/:id/messages/:messageId/reaction", async (req, res) => {
  try {
    const emoji = String(req.body?.emoji ?? "").trim();
    if (!emoji) {
      res.status(400).json({ error: "missing_emoji" });
      return;
    }

    const conversation = await getConversationById(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }

    const message = await getMessageForConversation(
      conversation.id,
      String(req.params.messageId),
    );
    if (!message) {
      res.status(404).json({ error: "message_not_found" });
      return;
    }
    if (!message.external_message_id) {
      res.status(400).json({ error: "message_without_whatsapp_id" });
      return;
    }

    const sent = await sendWhatsAppReaction({
      toE164: conversation.phone,
      messageId: message.external_message_id,
      emoji,
    });
    if (!sent.ok) {
      res.status(400).json({ error: sent.error });
      return;
    }

    res.json({ ok: true, externalMessageId: sent.externalMessageId });
  } catch (err) {
    console.error("[panel/reaction]", err);
    res.status(500).json({ error: "reaction_failed" });
  }
});

/** Apaga do painel/banco. A Cloud API não remove mensagem já entregue no WhatsApp do lead. */
router.delete("/conversations/:id/messages/:messageId", async (req, res) => {
  try {
    const conversation = await getConversationById(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }
    const message = await getMessageForConversation(
      conversation.id,
      String(req.params.messageId),
    );
    if (!message) {
      res.status(404).json({ error: "message_not_found" });
      return;
    }
    if (message.role === "user") {
      res.status(400).json({ error: "cannot_delete_lead_message" });
      return;
    }
    const ok = await deleteMessageForPanel(conversation.id, message.id);
    if (!ok) {
      res.status(500).json({ error: "delete_failed" });
      return;
    }
    res.json({ ok: true, scope: "panel_only" });
  } catch (err) {
    console.error("[panel/delete-message]", err);
    res.status(500).json({ error: "delete_failed" });
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
