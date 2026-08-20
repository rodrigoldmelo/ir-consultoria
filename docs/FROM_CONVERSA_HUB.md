# Do Conversa Hub (V&C) → IR Consultoria

Referência de código/padrões: `/Users/rodrigolemos/Documents/CONVERSA-HUB`
**Não** copiar arquivos à cega; extrair padrões.

## Reaproveitar (padrão)

| Padrão Lis | Uso na IR |
|------------|-----------|
| Webhook Meta + statuses de entrega | WhatsApp inbound/outbound |
| `x-conversa-panel-token` / login cookie Vercel | Login cookie `ir_panel_session` + credenciais `IR_PANEL_*` no backend |
| Delay humanizado / abort se mensagem nova | Orquestrador |
| Transcrição de áudio | Se lead mandar áudio |
| Confirmação + handoff em imagem/doc | Intake documental (evoluir para checklist) |
| Follow-up com janela 24h Meta | Follow-up pós-template **só após** reply |
| Smoke checklist / typecheck disciplina | Operação IR |
| Isolamento de secrets / System User token | WABA IR |

## Não copiar

| Lis | Motivo |
|-----|--------|
| `meeting-scheduler.ts` | IR não agenda reunião |
| `google-oauth.ts` / Calendar / Meet | Fora do produto |
| `lis-system-prompt` / regras previdenciárias | Nicho diferente |
| Workers de lembrete de reunião | Sem reunião |
| Phone number / token / templates V&C | Conta diferente |
| Supabase projeto da Lis (sem schema `ir_*`) | Isolamento de dados |

## Maior adaptação de produto

Lis = **receptiva** (lead inicia no WA).
IR = **ativa** (formulário → template → conversa).

Isso exige: Lead Ads webhook, template aprovado, opt-in, fila de disparo, estados `template_*` / `awaiting_first_reply` — inexistentes no funil principal da Lis.
