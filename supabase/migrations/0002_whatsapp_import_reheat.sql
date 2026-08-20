-- DRAFT — import histórico WA + scores de reaquecimento.
-- Rodar após 0001_ir_schema_draft.sql

create table if not exists ir_whatsapp_imports (
  id uuid primary key default gen_random_uuid(),
  filename text,
  source_format text, -- zip_txt | csv | json
  status text not null default 'pending', -- pending | processing | done | failed
  conversations_count int default 0,
  messages_count int default 0,
  error_message text,
  storage_path text,
  uploaded_by text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists ir_reheat_scores (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references ir_conversations (id),
  lead_id uuid references ir_leads (id),
  phone text,
  score numeric not null default 0,
  action text not null, -- reheat | reanalyze | skip | needs_human
  reasons jsonb,
  suggested_opener text,
  model text,
  human_decision text, -- approved | rejected | pending
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ir_reheat_scores_action_idx on ir_reheat_scores (action);
create index if not exists ir_reheat_scores_score_idx on ir_reheat_scores (score desc);
create index if not exists ir_whatsapp_imports_status_idx on ir_whatsapp_imports (status);

-- Marcar conversas importadas
alter table ir_conversations
  add column if not exists source text default 'live'; -- live | import

alter table ir_messages
  add column if not exists import_id uuid references ir_whatsapp_imports (id);
