-- Índices para manter o painel rápido em bases maiores.
-- As listagens usam updated_at/status em conversas, status em leads e última mensagem por conversa.

create index if not exists ir_conversations_updated_at_idx
  on ir_conversations (updated_at desc);

create index if not exists ir_conversations_status_idx
  on ir_conversations (status);

create index if not exists ir_messages_conversation_created_at_idx
  on ir_messages (conversation_id, created_at desc);

create index if not exists ir_leads_status_idx
  on ir_leads (status);

create index if not exists ir_leads_phone_created_at_idx
  on ir_leads (phone, created_at desc);
