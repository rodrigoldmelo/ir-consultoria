export type PanelPage =
  | "dashboard"
  | "leads"
  | "conversas"
  | "reaquecer"
  | "importar"
  | "config";

export type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  source?: string | null;
  created_at?: string;
};

export type ReheatRow = {
  id: string;
  phone: string | null;
  score: number;
  action: string;
  human_decision?: string | null;
  reasons?: unknown;
  suggested_opener?: string | null;
};

export type ImportRow = {
  id: string;
  filename: string | null;
  status: string;
  conversations_count?: number;
  messages_count?: number;
  created_at?: string;
};

export type ConversationRow = {
  id: string;
  lead_id?: string | null;
  phone: string;
  status: string;
  source?: string | null;
  template_status?: string | null;
  template_name?: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  lead_source?: string | null;
  lead_form_id?: string | null;
  lead_meta_id?: string | null;
  lead_is_doctor?: boolean | null;
  lead_doctor_answer?: string | null;
  last_message_text?: string | null;
  last_message_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  updated_at?: string;
  created_at?: string;
};

export type DocumentRow = {
  id: string;
  document_type: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  role: string;
  text: string | null;
  message_type?: string | null;
  external_message_id?: string | null;
  delivery_status?: string | null;
  created_at: string;
};
