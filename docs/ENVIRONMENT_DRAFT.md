# IR Consultoria — Ambiente e Variaveis Previstas

Rascunho. Nao preencher segredos no repositorio.

## Aplicacao

```env
IR_APP_ENV=production
IR_PUBLIC_API_URL=
IR_INTERNAL_API_URL=
IR_AGENT_NAME=
IR_DEFAULT_TIMEZONE=America/Sao_Paulo
IR_PANEL_TOKEN=
IR_PANEL_LOGIN_USER=admin
IR_PANEL_LOGIN_PASSWORD=
IR_PANEL_SESSION_SECRET=
```

## Banco e storage

```env
IR_SUPABASE_URL=
IR_SUPABASE_ANON_KEY=
IR_SUPABASE_SERVICE_ROLE_KEY=
IR_STORAGE_DOCUMENTS_BUCKET=ir-documents
```

## OpenAI

```env
IR_OPENAI_API_KEY=
IR_OPENAI_MODEL=gpt-4o-mini
IR_OPENAI_EXTRACTION_MODEL=gpt-4o-mini
```

## Meta Lead Ads

```env
IR_META_APP_ID=
# Obrigatório em produção: valida a assinatura dos webhooks (npm run check:webhook)
IR_META_APP_SECRET=
IR_META_VERIFY_TOKEN=
IR_META_PAGE_ID=
IR_META_FORM_IDS=
IR_META_GRAPH_VERSION=v20.0
```

## WhatsApp Cloud API

```env
IR_META_WABA_ID=
IR_META_PHONE_NUMBER_ID=
IR_META_WHATSAPP_TOKEN=
IR_WHATSAPP_TEMPLATE_INITIAL=
IR_WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
IR_WHATSAPP_TEMPLATE_TRUST=
IR_WHATSAPP_TEMPLATE_EXPLAIN=
IR_WHATSAPP_TEMPLATE_REHEAT=
IR_DRIP_STEP2_HOURS=24
IR_DRIP_STEP3_HOURS=120
```

## Advbox

```env
IR_ADVBOX_BASE_URL=
IR_ADVBOX_API_TOKEN=
IR_ADVBOX_RESPONSIBLE_USER_ID=
IR_ADVBOX_TASK_TYPE_ID=
IR_ADVBOX_CASE_TYPE_ID=
```

## Workers

```env
IR_TEMPLATE_WORKER_ENABLED=true
IR_ADVBOX_SYNC_WORKER_ENABLED=true
IR_DOCUMENT_CLASSIFICATION_WORKER_ENABLED=true
IR_FOLLOW_UP_WORKER_ENABLED=false
IR_INWINDOW_NUDGE_ENABLED=false
```

## Webhooks previstos

- `GET /api/ir/webhooks/meta-leads` — verificacao Meta Lead Ads
- `POST /api/ir/webhooks/meta-leads` — entrada de lead
- `GET /api/ir/webhooks/whatsapp` — verificacao WhatsApp
- `POST /api/ir/webhooks/whatsapp` — mensagens WhatsApp
- `POST /api/ir/webhooks/advbox` — opcional, se Advbox suportar callbacks

## Observacoes

- Prefixo `IR_` para nao colidir com a Lis.
- Token permanente via System User no Meta Business.
- Sem variaveis de Google Calendar / Meet.
