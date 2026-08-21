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
/** Triagem documental: CNIS + DIRF/rendimentos para precisão da análise humana. */
export const REQUIRED_DOCUMENT_TYPES = ["cnis", "dirf_income"] as const;

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

/** Palpite pelo texto/legenda/contexto; classificação final segue revisão humana. */
export function guessDocumentType(
  hint: string | undefined,
  expectedType?: DocumentType | null,
): DocumentType {
  const text = (hint ?? "").toLowerCase();
  if (!text) return expectedType ?? "other";
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
  return expectedType ?? "other";
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
  expectedDocumentType?: DocumentType | null;
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
  const existingBeforeInsert = await listDocumentsForCase(irCase.id);
  const presentBeforeInsert = new Set(
    existingBeforeInsert.map((d) => d.document_type),
  );
  const contextualExpectedType =
    input.expectedDocumentType ??
    (presentBeforeInsert.has("cnis") ? "dirf_income" : "cnis");

  const documentType = guessDocumentType(
    [input.caption, input.filename].filter(Boolean).join(" "),
    contextualExpectedType,
  );
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
  if (stored.documentType === "cnis" && stored.missing.includes("dirf_income")) {
    return [
      "Recebi e registrei o CNIS.",
      "Agora ainda precisamos das informações de rendimentos/DIRFs para uma análise mais precisa.",
      "O passo a passo que te enviei também mostra como baixar as DIRF's pelo Portal e-CAC. Se você já tiver os arquivos, pode enviar por aqui.",
    ].join("\n\n");
  }
  const pending = stored.missing.map((m) => LABELS[m] ?? m).join("; ");
  return `Recebi e registrei o documento, obrigado. Para completar a análise ainda falta: ${pending}. Pode enviar quando puder — no seu ritmo.`;
}
