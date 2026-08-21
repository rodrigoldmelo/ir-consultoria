# NEXT ACTIONS — IR Consultoria
**Atualizado:** 2026-08-19

## Contexto produto

Restituição INSS gera **desconfiança** (medo de golpe; serviço pouco conhecido vs IR). Funil = confiança + cadência (`docs/TRUST_AND_DRIP.md`).

## Agora (ordem recomendada)

### Bloqueio ativo (2026-08-21) — Lead Ads → sistema

Ver handoff: `docs/HANDOFF_CODEX_LEADGEN_2026-08-21.md`.

- Webhook Test OK; fills reais na Central **sem** POST no pm2.
- Bypass: `npx tsx scripts/meta-pull-leads.ts --form 1444863843996760` (Page Token limpo na VPS).
- Form ID atual na Central: `1444863843996760`.

### Você (Meta) — inbound WA em produção OK (2026-08-19)

Webhook + `messages` + Phone number ID corretos: “Oi” no número da IR recebe resposta.

1. **Subir estes ajustes de painel** (dashboard full-width, nomes, origem META/Orgânico): sync VPS + `npm run panel:build` + `pm2 restart ir-consultoria-api --update-env`. Confirmar `IR_WHATSAPP_TEMPLATE_INITIAL=contato_inicial` no `.env` da VPS.
2. **Antes de anúncio pago:** Instant Form + opt-in WhatsApp; webhook Lead Ads `https://ir.meuanalistacrm.app/api/ir/webhooks/meta-leads` com `leadgen`; `IR_META_PAGE_ID` (+ `IR_META_FORM_IDS`) na VPS; template `contato_inicial` aprovado; teste com 1 lead real do formulário.
3. Meta: criar `ir_confianca` e `ir_explica_inss` (textos em `docs/META_OUTREACH.md`). Quando aprovados: env na VPS + `IR_FOLLOW_UP_WORKER_ENABLED=true`.
4. Opcional: `IR_INWINDOW_NUDGE_ENABLED=true`.
5. Critérios Fase 0 + Advbox (não bloqueiam o 1º contato automático).

VPS: não `pm2 kill`, não `restart all`. Lis = `:9000` / `vec`. IR = `:3010` / `ir.`.

OpenAI configurada (`npm run check:agent` valida o prompt sem custo Meta).

Migrations: **0001, 0002 e 0003 aplicadas** (validar com `npm run check:db`).

### Cérebro (você + código)

- Arquivo vivo: `prompts/agent-system-prompt.md` + base `prompts/knowledge/IR_CONSULTORIA_CEREBRO_AGENTE.md`. Alegações 2k/R$25mi off até aprovação.
- Produção: sync VPS + `pm2 restart ir-consultoria-api --update-env`. Local: `api:dev` já relê o arquivo.

### Código (próximas fatias)

1. Meta OK → E2E template + VPS `ir.` (trocar localtunnel).
2. RLS nas tabelas `ir_*` (migration 0004).
3. Advbox sync (cliente/caso/tarefa) após critérios e API.
4. Extrator estruturado de qualificação (hoje fallback + OpenAI livre).
5. Classificação de documento por modelo (hoje palpite pela legenda).

## Feito

- Scaffold, Supabase `ir_*`, Meta env, webhook WA verify
- Orquestrador + painel shell
- Import CSV + reheat batch + **aprovar/rejeitar** (template reativação só se approved)
- Drip schedule pós-template + follow-up worker + cancel on reply
- Inbox: lista + msgs + takeover + **reply humano** + devolver ao agente
- Painel no domínio `ir.` com **login e senha** (cookie; credenciais no backend)
- Agente silencioso em `waiting_human` (exceto opt-out)
- Documentos: mídia Meta → bucket + `ir_documents` + checklist + link assinado no painel
- Webhooks Meta com assinatura HMAC validada (`npm run check:webhook`)
- Fila do template inicial persistida em `ir_leads.status` (sobrevive a restart, `npm run check:queue`)

## Explicitamente NÃO fazer

- Disparo em massa sem opt-in / sem aprovação humana no reheat
- Calendar / meeting-scheduler da Lis
- Prometer valor ou “direito garantido” no agente
