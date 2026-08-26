export type LeadStatus =
  | "new"
  | "template_queued"
  | "template_sending"
  | "template_sent"
  | "awaiting_reply"
  | "conversation_started"
  | "converted_to_case"
  | "lost"
  | "invalid"
  | "opt_out";

export type ConversationStatus =
  | "awaiting_first_reply"
  | "in_service"
  | "qualifying"
  | "waiting_documents"
  | "documents_partial"
  | "documents_complete"
  | "waiting_human"
  | "opt_out"
  | "closed";

export type CaseStatus =
  | "draft"
  | "qualifying"
  | "likely_eligible"
  | "unlikely_eligible"
  | "needs_human_review"
  | "documents_requested"
  | "documents_partial"
  | "documents_complete"
  | "advbox_sync_pending"
  | "advbox_synced"
  | "task_created"
  | "analysis_in_progress"
  | "analysis_done"
  | "closed_won"
  | "closed_lost";

export type IngestedLead = {
  metaLeadgenId: string;
  name?: string;
  phone?: string;
  email?: string;
  isDoctor?: boolean | null;
  doctorAnswer?: string;
  formId?: string;
  campaignId?: string;
  adId?: string;
  optInWhatsapp?: boolean;
  source?: string;
  rawPayload: unknown;
};

export type TemplateDispatchResult =
  | { ok: true; externalMessageId?: string }
  | { ok: false; permanent: boolean; error: string };
