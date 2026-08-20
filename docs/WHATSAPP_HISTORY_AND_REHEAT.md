# Histórico WhatsApp + Reaquecer / Reanálise

**Status:** migration 0002 aplicada. Parser CSV + job reheat + **aprovação humana no painel** prontos. Disparo E2E espera template Meta `IR_WHATSAPP_TEMPLATE_REHEAT`.
Também cobre leads novos sem reply (drip templates) — ver `TRUST_AND_DRIP.md`.

---

## Problema

A IR já conversou no WhatsApp Business no passado. Queremos:

1. **Importar** o histórico (manual) para o sistema.
2. Um agente **analisar a frio** quem vale:
   - **Reaquecer** (reativar contato com template/mensagem), ou
   - **Reanalisar** (caso antigo que não fechou — documentos / indício).
3. Humano decide o que dispara (nunca auto-spam).

---

## Fluxo

```text
Export WA / ZIP / CSV / JSON
  → Upload no painel (Importar)
  → Parser → ir_whatsapp_imports + ir_conversations/messages (source=import)
  → Job Agente Reaquecer (batch)
  → ir_reheat_scores (score, motivo, ação sugerida)
  → Fila no painel "Reaquecer"
  → Humano aprova → template Meta OU handoff
```

---

## Fontes de import (fase 1)

| Formato | Prioridade | Notas |
|---------|------------|-------|
| Export WhatsApp Business (ZIP/txt) | Alta | Parse conversas por chat |
| CSV export (telefone, nome, última msg, data) | Alta | Mais simples |
| JSON próprio (API futura) | Média | |

Sem Evolution/Lis. Conta WABA **da IR**.

---

## Score (agente frio)

Campos sugeridos em `ir_reheat_scores`:

- `score` 0–100
- `action`: `reheat` | `reanalyze` | `skip` | `needs_human`
- `reasons` (JSON): engajamento, docs parciais, objeção, tempo desde última msg
- `suggested_opener` (texto curto — só após aprovação humana)
- `model` usado

Critérios iniciais (ajustar com negócio):

| Sinal | Peso |
|-------|------|
| Enviou docs e parou | Alto → reanalyze |
| Respondeu mas não enviou docs | Médio → reheat |
| Opt-out / “não tenho interesse” | Skip |
| Sem resposta há >90 dias + lead frio | Baixo / skip |
| Pediu humano e sumiu | needs_human |

---

## Guardrails

- Sem disparo automático em massa.
- Opt-out histórico → nunca reaquecer.
- Template Meta só com opt-in / política ok.
- Análise = **indício operacional**, não parecer jurídico.

---

## Schema (ver migration `0002`)

- `ir_whatsapp_imports`
- `ir_reheat_scores`

---

## UI

Painel → **Importar** (upload) + **Reaquecer** (fila com scores).
