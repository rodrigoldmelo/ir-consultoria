import { getSupabaseAdmin } from "../services/supabase.js";
import type { CaseStatus } from "../types/index.js";

export type IrCaseRow = {
  id: string;
  lead_id: string | null;
  conversation_id: string | null;
  status: CaseStatus;
  missing_information: unknown;
  created_at: string;
  updated_at: string;
};

/** Caso é criado sob demanda: só existe quando há material para analisar. */
export async function findOrCreateCaseForConversation(input: {
  conversationId: string;
  leadId?: string | null;
}): Promise<IrCaseRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data: existing, error: findErr } = await db
    .from("ir_cases")
    .select("*")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("[db/cases] find", findErr.message);
  }
  if (existing) return existing as IrCaseRow;

  const { data, error } = await db
    .from("ir_cases")
    .insert({
      conversation_id: input.conversationId,
      lead_id: input.leadId ?? null,
      status: "documents_partial",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[db/cases] insert", error.message);
    return null;
  }
  return data as IrCaseRow;
}

export async function updateCase(
  caseId: string,
  patch: { status?: CaseStatus; missingInformation?: unknown },
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status) updates.status = patch.status;
  if (patch.missingInformation !== undefined) {
    updates.missing_information = patch.missingInformation;
  }

  const { error } = await db.from("ir_cases").update(updates).eq("id", caseId);
  if (error) {
    console.error("[db/cases] update", error.message);
  }
}

export async function listDocumentsForCase(caseId: string): Promise<
  Array<{
    id: string;
    document_type: string | null;
    original_filename: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
  }>
> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from("ir_documents")
    .select("id, document_type, original_filename, mime_type, size_bytes, classification_status, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[db/cases] listDocuments", error.message);
    return [];
  }
  return (data ?? []).filter(
    (doc) => doc.classification_status !== "panel_outbound_media",
  );
}
