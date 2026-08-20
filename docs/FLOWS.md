# Fluxos e estados — IR Consultoria

## Estados principais (conversa / caso)

```text
new
  → template_queued
  → template_sending   (reserva do worker; volta para queued se o processo cair)
  → template_sent
  → awaiting_first_reply
  → in_service / qualifying
  → likely_eligible | unlikely_eligible | needs_human
  → documents_requested
  → documents_receiving
  → documents_complete
  → advbox_pending
  → advbox_created
  → task_created
  → human_review
  → lost | opt_out | closed
```

## Transições críticas

| De | Para | Gatilho |
|----|------|---------|
| `new` | `template_queued` | Lead ingerido |
| `template_queued` | `template_sending` | Worker reserva o lead (atômico) |
| `template_sending` | `template_sent` | Meta aceita envio |
| `template_sending` | `template_queued` | Falha transitória ou reserva travada há 15 min |
| `template_sending` | `lost` | Falha permanente (número inválido, template rejeitado) |
| `template_sent` | `awaiting_first_reply` | Aguarda inbound |
| `awaiting_first_reply` | `qualifying` | Aceite (Sim) → abertura: o que é Restituição do INSS + “já conhecia?” (ou pede o nome se faltar) |
| `awaiting_first_reply` | `awaiting_first_reply` | Dúvida antes do aceite (golpe, valor) — OpenAI; Sim ainda dispara a abertura |
| `qualifying` | `documents_requested` | Indício suficiente / checklist definido |
| `documents_receiving` | `documents_complete` | Obrigatórios ok |
| `documents_complete` | `advbox_pending` | Pronto para sync |
| qualquer | `opt_out` | Pedido para parar |
| qualquer | `human_review` | Risco / ambiguidade / falha |

## Regras

- Antes da 1ª resposta do lead: **somente template** (ou mensagens permitidas fora da janela 24h).
- Depois da resposta: free-text na janela 24h.
- Sem 1ª resposta em 24h: template `ir_confianca` (depois `ir_explica_inss`), worker off até Meta aprovar.
- Nunca inventar elegibilidade definitiva; usar `likely` / `unlikely` / `needs_human`.
- Sem estados de `meeting_*` / scheduling.
