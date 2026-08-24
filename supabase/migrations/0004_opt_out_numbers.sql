create table if not exists ir_opt_out_numbers (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  normalized_phone text not null unique,
  source text not null default 'whatsapp',
  reason text,
  last_message_text text,
  conversation_id uuid references ir_conversations (id),
  lead_id uuid references ir_leads (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ir_opt_out_numbers_conversation_idx
  on ir_opt_out_numbers (conversation_id);

create index if not exists ir_opt_out_numbers_lead_idx
  on ir_opt_out_numbers (lead_id);

insert into ir_opt_out_numbers (
  phone,
  normalized_phone,
  source,
  reason,
  lead_id,
  created_at,
  updated_at
)
select distinct on (regexp_replace(phone, '\D', '', 'g'))
  phone,
  regexp_replace(phone, '\D', '', 'g') as normalized_phone,
  coalesce(source, 'legacy_lead'),
  'backfill_lead_opt_out',
  id,
  now(),
  now()
from ir_leads
where status = 'opt_out'
  and phone is not null
  and regexp_replace(phone, '\D', '', 'g') <> ''
on conflict (normalized_phone) do nothing;
