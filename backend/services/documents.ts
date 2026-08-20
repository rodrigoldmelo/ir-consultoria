import { createHash } from "node:crypto";
import { config } from "../config.js";
import { recordAuditEvent } from "../db/audit.js";
import {
  findOrCreateCaseForConversation,
  listDocumentsForCase,
  updateCase,
} from "../db/cases.js";
import { getSupabaseAdmin } from "./supabase.js";
import { downloadWhatsAppMedia } from "./meta-graph.js";

/**
 * Tipos do checklist. Lista fechada ainda depende da tese jurídica
 * (`docs/DOCUMENT_CHECKLIST.md`) — aqui ficam só os obrigatórios propostos.
 */
/** Triagem inicial (cérebro v1.1): CNIS. DIRF entra na apuração precisa (não bloqueia triagem). */
export const REQUIRED_DOCUMENT_TYPES = ["cnis"] as const;

export type DocumentType =
  | (typeof REQUIRED_DOCUMENT_TYPES)[number]
  | "dirf_income"
  | "inss_statement"
  | "identity"
  | "address_proof"
  | "income_tax"
  | "payslip"
  | "contract"
  | "other";

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/webm": "webm",
};

/** Palpite pelo texto/legenda; classificação real fica para revisão humana. */
export function guessDocumentType(hint: string | undefined): DocumentType {
  const text = (hint ?? "").toLowerCase();
  if (!text) return "other";
  if (text.includes("dirf") && !text.includes("dirpf")) {
    return "dirf_income";
  }
  if (
    text.includes("cnis") ||
    text.includes("vínculos, contribuições e remunerações") ||
    text.includes("vinculos, contribuicoes e remuneracoes") ||
    text.includes("vínculos e contribuições") ||
    text.includes("vinculos e contribuicoes")
  ) {
    return "cnis";
  }
  if (text.includes("inss") || text.includes("contribui")) {
    return "inss_statement";
  }
  if (
    text.includes("rg") ||
    text.includes("cnh") ||
    text.includes("cpf") ||
    text.includes("identidade")
  ) {
    return "identity";
  }
  if (
    text.includes("residência") ||
    text.includes("residencia") ||
    text.includes("comprovante de endereço") ||
    text.includes("endereco") ||
    text.includes("conta de luz")
  ) {
    return "address_proof";
  }
  if (text.includes("imposto") || text.includes("declara")) return "income_tax";
  if (text.includes("holerite") || text.includes("contracheque")) return "payslip";
  if (text.includes("contrato")) return "contract";
  return "other";
}

export type StoredDocument = {
  documentId: string;
  documentType: DocumentType;
  missing: DocumentType[];
  complete: boolean;
};

/**
 * Baixa a mídia da Meta, guarda no bucket e registra em ir_documents.
 * Cria o caso na primeira mídia recebida.
 */
export async function storeInboundDocument(input: {
  conversationId: string;
  leadId?: string | null;
  phone: string;
  mediaId: string;
  caption?: string;
  filename?: string;
}): Promise<StoredDocument | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const media = await downloadWhatsAppMedia(input.mediaId);
  if (!media) return null;

  const supported =
    media.mimeType in EXTENSION_BY_MIME ||
    media.mimeType.startsWith("image/") ||
    media.mimeType.startsWith("audio/");
  if (!supported) {
    await recordAuditEvent({
      entityType: "conversation",
      entityId: input.conversationId,
      eventType: "document_rejected",
      summary: `Formato não suportado: ${media.mimeType}`,
    });
    return null;
  }

  const irCase = await findOrCreateCaseForConversation({
    conversationId: input.conversationId,
    leadId: input.leadId,
  });
  if (!irCase) return null;

  const sha256 = createHash("sha256").update(media.buffer).digest("hex");
  const extension =
    EXTENSION_BY_MIME[media.mimeType] ??
    media.mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") ??
    "bin";
  const documentType = guessDocumentType(input.caption ?? input.filename);
  const storagePath = `${irCase.id}/${documentType}-${sha256.slice(0, 12)}.${extension}`;
  const bucket = config.supabase.documentsBucket;

  const upload = await db.storage.from(bucket).upload(storagePath, media.buffer, {
    contentType: media.mimeType,
    upsert: true,
  });
  if (upload.error) {
    console.error("[documents] upload", upload.error.message);
    return null;
  }

  const { data: inserted, error } = await db
    .from("ir_documents")
    .insert({
      case_id: irCase.id,
      conversation_id: input.conversationId,
      document_type: documentType,
      storage_bucket: bucket,
      storage_path: storagePath,
      original_filename: input.filename ?? null,
      mime_type: media.mimeType,
      size_bytes: media.sizeBytes,
      sha256,
      classification_status: "auto_guess",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[documents] insert", error?.message);
    return null;
  }

  const stored = await listDocumentsForCase(irCase.id);
  const present = new Set(stored.map((d) => d.document_type));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !present.has(t));
  const complete = missing.length === 0;

  await updateCase(irCase.id, {
    status: complete ? "documents_complete" : "documents_partial",
    missingInformation: { missing_documents: missing },
  });

  await recordAuditEvent({
    entityType: "case",
    entityId: irCase.id,
    eventType: "document_received",
    summary: `${documentType} recebido (${media.mimeType})`,
    metadata: { sha256, storagePath, missing },
  });

  return {
    documentId: inserted.id,
    documentType,
    missing: [...missing],
    complete,
  };
}

const LABELS: Record<string, string> = {
  cnis: "CNIS — Extrato de Contribuições (Vínculos, contribuições e remunerações)",
  dirf_income: "cópia dos rendimentos informados em DIRF pelas fontes pagadoras",
  identity: "documento de identidade (RG/CNH) com CPF",
  address_proof: "comprovante de residência recente",
  inss_statement: "extrato de contribuições do INSS (CNIS), se tiver",
};

/** Texto de confirmação + pendências. Sem prometer resultado. */
export function documentAckMessage(stored: StoredDocument): string {
  if (stored.complete) {
    return "Recebi e registrei o documento. Com isso já tenho o material principal: a análise passa agora para a nossa equipe, que confere se há indício de restituição do INSS. Assim que houver retorno, te aviso por aqui.";
  }
  const pending = stored.missing.map((m) => LABELS[m] ?? m).join("; ");
  return `Recebi e registrei o documento, obrigado. Para completar a análise ainda falta: ${pending}. Pode enviar quando puder — no seu ritmo.`;
}
