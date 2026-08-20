# Arquitetura — IR Consultoria

## Fluxo ponta a ponta

```text
Formulário (Meta Lead Ads / landing)
  → Lead Ingestion (webhook / Graph API)
  → ir_leads (status new)
  → Template Dispatcher (WhatsApp Cloud API)  ← CUSTO META ACEITO
  → Lead recebe template e responde
  → Webhook WhatsApp
  → Conversation Orchestrator + Qualification Engine
  → Document Intake (mídia WA / upload)
  → Storage + checklist
  → Advbox (cliente + anexos + tarefa)
  → Fila humana (cálculo / decisão final)
```

## Incluído no desenho

- Ingestão ativa de leads
- Template WhatsApp inicial
- Conversa autônoma pós-resposta
- Qualificação estruturada
- Coleta/classificação básica de documentos
- Pipeline de status do caso
- Advbox + tarefa
- Painel mínimo + logs/retentativas

## Fora do escopo (até regras fecharem)

- Decisão jurídica definitiva automática
- Cálculo automático de valores
- Proposta/contrato/pagamento automáticos
- **Qualquer** Google Calendar / Meet / agendamento

## Componentes (resumo)

1. **Lead Ingestion** — dedupe `meta_leadgen_id`, telefone E.164, evento `lead_received`, enfileira template.
2. **Template Dispatcher** — só template aprovado; retentativa; `outreach_failed` se permanente.
3. **Conversation Orchestrator** — estados em `FLOWS.md`; prompt IR; handoff humano em risco.
4. **Qualification Engine** — score/status preliminar + campos faltantes.
5. **Document Intake** — hash, MIME, checklist; sem Advbox até caso pronto.
6. **Advbox Integration** — fila + retentativa.
7. **Human Review Queue** — opt-out, ilegível, ambíguo, falha API, pedido humano.

## Separação vs Lis

Não reutilizar: prompts Lis, `lis-rules`, `meeting-scheduler`, Calendar V&C, templates/WABA da Lis.

Pode reaproveitar conceitos: webhook Meta, mensagens/delivery, delay humanizado, painel SSE/polling, logs.
