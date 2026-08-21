# AI HANDOFF — IR Consultoria
**Atualizado:** 2026-08-19

## Para a próxima janela

Workspace: `/Users/rodrigolemos/Documents/IR-CONSULTORIA`
Ler: `AGENTS.md` → `PROJECT_STATUS` → `AI_MODELS.md` → `TRUST_AND_DRIP.md` → `NEXT_ACTIONS`.

## Papel do agente neste projeto

Cursor = **cérebro / arquiteto / orquestrador** do produto IR (isolado da Lis). Distribui modelos por função (`docs/AI_MODELS.md`).

## Decisões

1. Repo/PM2/WABA isolados da Lis; mesma VPS (`ir.:3010` / Lis `:9000` + `vec`).
2. Funil ativo: form → template → docs → Advbox (sem Calendar).
3. Reheat: humano aprova um a um; skip nunca dispara; template `IR_WHATSAPP_TEMPLATE_REHEAT`.
4. Takeover: `waiting_human` silencia o agente; reply humano só na janela 24h.
5. Drip templates só com opt-in + worker flag + cancel no 1º reply.

## Estado técnico

- Meta env + webhook WA; URL pública `https://ir.meuanalistacrm.app` (túnel, não localtunnel).
- Supabase mesmo projeto Lis, tabelas `ir_*` + bucket; **0001/0002/0003 aplicadas** (`npm run check:db`).
- Painel: Import CSV, Reheat decide, Inbox reply/takeover/resume + documentos + envio humano de anexos com IA pausada. Login cookie (não colar token).
- Follow-up worker real (off por default).
- Documentos: `services/documents.ts` (sha256 + bucket + checklist); caso criado na 1ª mídia. Recebe PDF/imagens/áudios suportados; envio manual de imagem/áudio/vídeo/documento passa por `/api/ir/panel/conversations/:id/media`.
- OpenAI ligada (`npm run check:agent`); runtime `prompts/agent-system-prompt.md`; tratamento Dr(a). + nome; abertura explica Restituição do INSS; PDF único CNIS + DIRF após o pedido dos documentos.
- Webhooks validam HMAC `x-hub-signature-256` (`npm run check:webhook`); sem assinatura
  só passa fora de produção.
- Fila do template inicial vive em `ir_leads.status` (`template_queued` → `template_sending`
  → `template_sent`), com recuperação de reserva travada há 15 min.

## Próximo

1. Sync VPS deste login + `npm run panel:build` + restart **só** `ir-consultoria-api`. Entrar em `https://ir.meuanalistacrm.app` com usuário/senha (não colar token).
2. Teste E2E `contato_inicial` pelo painel/formulário (número pessoal → Sim).
3. Templates `ir_confianca` / `ir_explica_inss` na Meta; só então ligar `IR_FOLLOW_UP_WORKER_ENABLED`.
4. RLS nas tabelas `ir_*` (migration 0004).
5. Advbox (fim do funil) — `documents_complete` já sinaliza pronto.

## Modelos (atalho)

| Uso | Modelo |
|-----|--------|
| Cursor arquitetura | Claude Opus |
| Cursor código | Composer |
| Chat WA | gpt-4o-mini |
| Reheat histórico | gpt-4o |
