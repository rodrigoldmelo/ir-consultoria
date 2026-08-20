# IR Consultoria — Modelo de Dados Inicial

Rascunho conceitual. Nao aplicar migration ainda.

## Entidades principais

### `ir_leads`

Representa o lead capturado por formulario.

Campos previstos:

- `id`
- `meta_leadgen_id`
- `campaign_id`
- `campaign_name`
- `adset_id`
- `adset_name`
- `ad_id`
- `ad_name`
- `form_id`
- `form_name`
- `name`
- `phone`
- `email`
- `source`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `raw_payload`
- `opt_in_whatsapp`
- `status`
- `created_at`
- `updated_at`

Indice unico:

- `meta_leadgen_id`

### `ir_conversations`

Representa a conversa WhatsApp vinculada ao lead.

Campos previstos:

- `id`
- `lead_id`
- `phone`
- `whatsapp_wa_id`
- `status`
- `last_inbound_at`
- `last_outbound_at`
- `template_status`
- `template_name`
- `template_sent_at`
- `human_owner_id`
- `created_at`
- `updated_at`

### `ir_messages`

Historico de mensagens.

Campos previstos:

- `id`
- `conversation_id`
- `role`: `user`, `assistant`, `human`, `system`
- `text`
- `message_type`: `text`, `image`, `document`, `audio`, `template`, `interactive`
- `external_message_id`
- `delivery_status`
- `delivery_error`
- `media_id`
- `created_at`

### `ir_cases`

Caso operacional para analise da restituicao INSS.

Campos previstos:

- `id`
- `lead_id`
- `conversation_id`
- `status`
- `eligibility_status`
- `eligibility_score`
- `reason_summary`
- `missing_information`
- `advbox_client_id`
- `advbox_case_id`
- `advbox_task_id`
- `assigned_to`
- `created_at`
- `updated_at`

### `ir_qualification_answers`

Dados estruturados coletados na conversa.

Campos previstos:

- `id`
- `case_id`
- `field_key`
- `field_value`
- `confidence`
- `source_message_id`
- `created_at`
- `updated_at`

### `ir_documents`

Documentos enviados pelo cliente.

Campos previstos:

- `id`
- `case_id`
- `conversation_id`
- `source_message_id`
- `document_type`
- `storage_bucket`
- `storage_path`
- `original_filename`
- `mime_type`
- `size_bytes`
- `sha256`
- `classification_status`
- `advbox_attachment_id`
- `created_at`

### `ir_advbox_sync_events`

Controle de integracao com Advbox.

Campos previstos:

- `id`
- `case_id`
- `operation`
- `status`
- `request_payload`
- `response_payload`
- `error_message`
- `attempts`
- `next_retry_at`
- `created_at`
- `updated_at`

### `ir_audit_events`

Auditoria operacional.

Campos previstos:

- `id`
- `entity_type`
- `entity_id`
- `event_type`
- `actor_type`: `system`, `agent`, `human`, `webhook`
- `summary`
- `metadata`
- `created_at`

## Status do lead/caso

### Lead

- `new`
- `template_queued`
- `template_sent`
- `awaiting_reply`
- `conversation_started`
- `converted_to_case`
- `lost`
- `invalid`
- `opt_out`

### Conversa

- `awaiting_first_reply`
- `in_service`
- `qualifying`
- `waiting_documents`
- `waiting_human`
- `closed`

### Caso

- `draft`
- `qualifying`
- `likely_eligible`
- `unlikely_eligible`
- `needs_human_review`
- `documents_requested`
- `documents_partial`
- `documents_complete`
- `advbox_sync_pending`
- `advbox_synced`
- `task_created`
- `analysis_in_progress`
- `analysis_done`
- `closed_won`
- `closed_lost`

## Eventos minimos

- `lead_received`
- `template_queued`
- `template_sent`
- `template_failed`
- `first_reply_received`
- `qualification_started`
- `qualification_updated`
- `eligibility_preclassified`
- `documents_requested`
- `document_received`
- `document_classified`
- `documents_complete`
- `advbox_client_created`
- `advbox_case_created`
- `advbox_document_attached`
- `advbox_task_created`
- `human_review_requested`
- `case_closed`
