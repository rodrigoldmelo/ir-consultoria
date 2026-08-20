-- Fila de drip de templates (leads sem 1ª resposta / cadência confiança).
-- Rodar após 0002.

create table if not exists ir_template_drip_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references ir_leads (id),
  conversation_id uuid references ir_conversations (id),
  phone text not null,
  template_name text not null,
  template_language text not null default 'pt_BR',
  step int not null default 1, -- 1 boas-vindas, 2 confiança, 3 explica...
  status text not null default 'scheduled', -- scheduled | sent | skipped | failed | cancelled
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  external_message_id text,
  error_message text,
  cancel_reason text, -- replied | opt_out | max_steps | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ir_template_drip_jobs_due_idx
  on ir_template_drip_jobs (status, scheduled_at)
  where status = 'scheduled';

create index if not exists ir_template_drip_jobs_lead_idx on ir_template_drip_jobs (lead_id);
