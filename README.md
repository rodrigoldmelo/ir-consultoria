# IR Consultoria — Agente WhatsApp (ativo)

Projeto **separado** do Conversa Hub / Lis (Vieira & Cavalcanti).

## Diferença central vs V&C / Lis

| | Lis (V&C) | IR Consultoria |
|---|-----------|----------------|
| Início | **Receptivo** — lead manda WhatsApp | **Ativo** — formulário converte → template WhatsApp |
| Objetivo | Qualificar + **agendar reunião** | Qualificar + **coletar documentos** para análise |
| Serviço | Planejamento previdenciário | Análise de direito à **Restituição do INSS** |
| Número WABA | Número V&C | Número **próprio** (a configurar) |
| Cérebro | `lis-rules` + `meeting-scheduler` | Regras IR + intake documental (**sem** Calendar/Meet) |
| Integração fim | Google Calendar + e-mail | Storage docs + **Advbox** + tarefa humana |

## Path

`/Users/rodrigolemos/Documents/IR-CONSULTORIA`

## Como usar em nova janela do Cursor

1. Abrir esta pasta como workspace.
2. Ler nesta ordem: `docs/PROJECT_STATUS.md` → `docs/AI_HANDOFF.md` → `docs/NEXT_ACTIONS.md` → `docs/ARCHITECTURE.md`.
3. Seguir `AGENTS.md`.

## Documentação

| Arquivo | Conteúdo |
|---------|----------|
| `docs/ARCHITECTURE.md` | Fluxo ponta a ponta |
| `docs/FROM_CONVERSA_HUB.md` | O que reaproveitar / o que NÃO copiar |
| `docs/FLOWS.md` | Estados e transições |
| `docs/DOCUMENT_CHECKLIST.md` | Documentos INSS (rascunho) |
| `docs/DATA_MODEL_DRAFT.md` | Modelo de dados |
| `docs/ENVIRONMENT_DRAFT.md` | Env vars |
| `docs/IMPLEMENTATION_CHECKLIST.md` | Fases de implementação |
| `docs/QUALIFICATION_QUESTIONS.md` | Perguntas de qualificação (rascunho) |
| `docs/META_SETUP_PASSO_A_PASSO.md` | Meta passo a passo |
| `docs/DEPLOY_VPS_E_META.md` | Meta nova + VPS junto da Lis (isolamento) |
| `prompts/agent-system-prompt.md` | Prompt inicial do agente |

## Princípio de isolamento

Não misturar secrets, WABA, prompts, tabelas ou workers da Lis. Pode reusar **padrões** do Conversa Hub (webhook Meta, mensagens, painel, delays).

## Rodar local

```bash
cp .env.example .env.local   # preencher depois; sem secrets no git
npm install
npm run api:dev              # http://localhost:3010/api/health
npm run panel:dev            # http://localhost:5174
```

## Estrutura

```text
backend/     API Express (webhooks + workers stub)
panel/       Painel operacional mínimo
supabase/    Draft schema ir_*
docs/        Memória do projeto
prompts/     System prompt do agente
```

## Estado

**Scaffold Fase 1** (2026-08-11). Stubs prontos; Fase 0 negócio + WABA/Supabase/Advbox ainda pendentes.
