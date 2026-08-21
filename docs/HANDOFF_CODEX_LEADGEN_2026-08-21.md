# Handoff Codex — Lead Ads webhook travado

**Data:** 2026-08-21  
**Repo:** `/Users/rodrigolemos/Documents/IR-CONSULTORIA`  
**Produção:** `https://ir.meuanalistacrm.app` · PM2 `ir-consultoria-api` · porta `:3010`  
**Isolamento:** não usar Lis / Conversa Hub / WABA da Lis. Sem Calendar/Meet.

---

## Objetivo do funil

```text
Instant Form (Lead Ads) → webhook leadgen → ir_leads → template contato_inicial → WhatsApp → conversa
```

WhatsApp **inbound** (mensagem “Oi”) já funciona. O que **não** funciona é o caminho **Lead Ads → sistema**.

---

## O que já está OK

| Item | Status |
|------|--------|
| App Meta **Live** (“API - IR Consultoria”, id `1024389387084946`) | OK |
| Webhook Page URL `…/api/ir/webhooks/meta-leads` + campo `leadgen` | OK (handshake + botão **Testar**) |
| `POST /{page-id}/subscribed_apps` com `subscribed_fields=leadgen` | OK → `{"success":true}` |
| GET `subscribed_apps` lista o app com `["leadgen"]` | OK |
| Leads aparecem na **Central de leads** da Meta | OK |
| Página | `323083024974374` — IR Consultoria Contábil e Previdenciária |
| Template inicial | `contato_inicial` (`IR_WHATSAPP_TEMPLATE_INITIAL`) |
| Painel / WA messaging | OK em produção |

### Prova do webhook (Teste Meta — esperado falhar ingestão)

```text
2026-08-20T21:40:33 [meta-graph] fetchLeadgenDetails 444444444444 Unsupported get request...
2026-08-20T21:40:33 [meta-leads] rejected invalid_phone
```

Isso prova: Meta **consegue** POSTar em `/meta-leads`. O ID `444444444444` é fake do botão Test — `invalid_phone` é **esperado**.

---

## Onde estamos TRAVADOS (bloqueio atual)

### Bloqueio A — Webhook real não entrega (principal)

1. Usuário preenche Instant Form → lead **aparece na Central de leads** (ex.: 20/08 ~19:14, Rodrigo).
2. `pm2 logs ir-consultoria-api --lines 0` → **zero** linha `[meta-leads]` / `[meta-signature]`.
3. Painel IR → lead **não** entra; WhatsApp **não** recebe `contato_inicial`.

Conclusão: **Lead Center ≠ webhook**. A Página está inscrita no app, o Test dispara, mas **fills reais não geram POST** no servidor (ou Meta não está entregando para esse fluxo de preview/form).

Form ID visto na Central no lead das 19:14:

```text
IR_META_FORM_IDS efetivo observado = 1444863843996760
```

Antes no `.env` havia outro id (`1369328231452473` — “FORMS - MÉDICOS”). Possível form diferente / republicado. Atualizar VPS para `1444863843996760`. O código **não filtra** por `formIds` na ingestão (só config); o ID errado no env **não** explica o silêncio no pm2.

### Bloqueio B — Bypass `meta-pull-leads` parado no token (secundário, operacional)

Script criado para puxar leads via Graph e chamar `ingestLead` + worker (não depende do webhook):

```bash
# VPS
export PAGE_TOKEN='…'   # Page Access Token de me/accounts
npx tsx scripts/meta-pull-leads.ts --form 1444863843996760
```

Erros já vistos:

1. `An access token is required` → `PAGE_TOKEN` vazio / sessão sem export  
2. `Invalid OAuth access token - Cannot parse access token` → token **corrompido na cola** (aspas, JSON, quebra de linha)

Último estado do humano: ainda não completou um pull com token limpo. Orientação: colar token em `/tmp/page_token.txt`, `tr -d`, validar `curl …/me?access_token=`, depois o script. **Nunca colar token no chat.**

---

## Hipóteses restantes (webhook)

Ordenadas por probabilidade prática:

1. **Preview do Instant Form** cria lead na Central mas **não** dispara `leadgen` webhook (só anúncio publicado / lead “de verdade”).
2. **Acesso a leads** no Business Manager (Leads Access Manager) não liberou o app CRM para a Página — às vezes bloqueia integração; webhook Test ainda funciona.
3. Entregas falhando no painel Meta (Webhooks → recent deliveries) — ainda **não** inspecionado pelo usuário.
4. Página com plataforma de apps desabilitada (raro; `subscribed_apps` já lista o app).
5. Depois que o webhook real chegar: `fetchLeadgenDetails` usa `IR_META_WHATSAPP_TOKEN` — se esse token **não** tiver `leads_retrieval`, vai falhar Graph no lead real (aí **haverá** log). Hoje nem chega POST.

---

## Arquivos relevantes

| Arquivo | Papel |
|---------|--------|
| `backend/routes/webhooks/meta-leads.ts` | GET verify + POST leadgen → `ingestLead` |
| `backend/middleware/meta-signature.ts` | HMAC; em produção sem assinatura → 403 + log `[meta-signature]` |
| `backend/services/meta-graph.ts` | `fetchLeadgenDetails(leadgenId)` via `IR_META_WHATSAPP_TOKEN` |
| `backend/services/lead-ingestion.ts` | Persiste `ir_leads`; rejeita `invalid_phone` |
| `scripts/meta-subscribe-leadgen.sh` | `POST subscribed_apps` |
| `scripts/meta-pull-leads.ts` | Bypass: Graph form/leads → `ingestLead` → `wakeTemplateWorker` |
| `docs/META_OUTREACH.md` / `META_SETUP_PASSO_A_PASSO.md` | Setup Meta |

NPM:

- `npm run meta:subscribe-leadgen`
- `npm run meta:pull-leads`
- Sync: `IR_VPS_HOST=root@187.77.232.209 npm run sync:vps`

---

## IDs / env (sem secrets)

```text
Page ID:     323083024974374
App ID:      1024389387084946  (API - IR Consultoria)
Form ID:     1444863843996760  (Central 19:14; atualizar VPS)
Webhook:     https://ir.meuanalistacrm.app/api/ir/webhooks/meta-leads
Template:    contato_inicial
```

VPS `.env` (humano): `IR_META_PAGE_ID`, `IR_META_FORM_IDS`, `IR_META_APP_SECRET`, `IR_META_WHATSAPP_TOKEN`, `IR_WHATSAPP_TEMPLATE_INITIAL=contato_inicial`, `IR_TEMPLATE_WORKER_ENABLED=true`.

**Segurança:** verify token já vazou em chat antigo — rotacionar quando possível. Não commitar `.env`. Não pedir token no chat.

---

## Próximos passos sugeridos (Codex / humano)

### Destravar E2E agora (bypass)

1. Sync código com `meta-pull-leads.ts` na VPS (se ainda não).
2. Page Token limpo → `npx tsx scripts/meta-pull-leads.ts --form 1444863843996760`
3. Esperado: `[pull] … → queued` + WhatsApp + lead no painel.

### Consertar webhook automático

1. Meta Developers → Webhooks → Page → `leadgen` → **recent deliveries** no horário do fill.
2. Business Manager → Integrações → **Acesso a leads** → liberar app na Página.
3. Testar com **anúncio publicado** (não só pré-visualizar formulário), se preview não disparar.
4. Quando POST real existir: garantir token com `leads_retrieval` para `fetchLeadgenDetails` (ou `IR_META_PAGE_TOKEN` dedicado no Graph client).
5. Opcional: worker de poll periódico no form (mesmo código do pull) como fallback de produção.

### Não fazer

- `pm2 kill` / `restart all` (Lis na mesma VPS).
- Copiar secrets da Lis.
- Tratar `invalid_phone` do Test `444…` como bug de telefone.

---

## Critério de sucesso

1. Novo fill (ou pull) → linha `[meta-leads] queued …` **ou** `[pull] … queued`  
2. Lead no painel com origem META  
3. WhatsApp recebe `contato_inicial`  
4. (Ideal) fills seguintes chegam **só** pelo webhook, sem pull manual
