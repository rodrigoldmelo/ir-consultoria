-- DRAFT — não aplicar em produção sem revisão.
-- Schema próprio IR Consultoria (ir_*). Isolado da Lis.

-- create schema if not exists ir;

create table if not exists ir_leads (
  id uuid primary key default gen_random_uuid(),
  meta_leadgen_id text not null unique,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  form_id text,
  form_name text,
  name text,
  phone text,
  email text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  raw_payload jsonb,
  opt_in_whatsapp boolean default true,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ir_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references ir_leads (id),
  phone text not null,
  whatsapp_wa_id text,
  status text not null default 'awaiting_first_reply',
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  template_status text,
  template_name text,
  template_sent_at timestamptz,
  human_owner_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ir_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ir_conversations (id),
  role text not null,
  text text,
  message_type text,
  external_message_id text,
  delivery_status text,
  delivery_error text,
  media_id text,
  created_at timestamptz not null default now()
);

create table if not exists ir_cases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references ir_leads (id),
  conversation_id uuid references ir_conversations (id),
  status text not null default 'draft',
  eligibility_status text,
  eligibility_score numeric,
  reason_summary text,
  missing_information jsonb,
  advbox_client_id text,
  advbox_case_id text,
  advbox_task_id text,
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ir_qualification_answers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ir_cases (id),
  field_key text not null,
  field_value text,
  confidence numeric,
  source_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ir_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ir_cases (id),
  conversation_id uuid references ir_conversations (id),
  source_message_id uuid,
  document_type text,
  storage_bucket text,
  storage_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  classification_status text,
  advbox_attachment_id text,
  created_at timestamptz not null default now()
);

create table if not exists ir_advbox_sync_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ir_cases (id),
  operation text not null,
  status text not null,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  attempts int not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ir_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  actor_type text not null,
  summary text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ir_leads_phone_idx on ir_leads (phone);
create index if not exists ir_conversations_phone_idx on ir_conversations (phone);
create index if not exists ir_cases_status_idx on ir_cases (status);
create index if not exists ir_messages_conversation_idx on ir_messages (conversation_id);
