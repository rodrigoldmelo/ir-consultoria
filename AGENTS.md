# AGENTS — IR Consultoria

Memória oficial para IAs neste repositório.

## Antes de alterar código

1. `docs/PROJECT_STATUS.md`
2. `docs/CHANGELOG_AI.md`
3. `docs/AI_HANDOFF.md`
4. `docs/KNOWN_ISSUES.md`
5. `docs/NEXT_ACTIONS.md`

## Regras de ouro

- Projeto **isolado** da Lis / V&C (`/Users/rodrigolemos/Documents/CONVERSA-HUB`).
- Canal: Meta WhatsApp Cloud API — **número e WABA próprios**.
- Modo: **outreach ativo** após conversão de formulário (template aprovado; custo Meta aceito).
- **Sem** Google Calendar / Meet / `meeting-scheduler`.
- Fim do funil: documentos → análise preliminar → Advbox + tarefa humana (cálculo/decisão final **humana**).
- Commit só quando o usuário pedir; nunca commitar secrets.
- Brain vault: `/Users/rodrigolemos/Documents/Brain` — recall no início, capture no fim.

## Stack prevista

Node/Express/TS, React/Vite (painel), Supabase (schema `ir_*`), Meta Lead Ads + WhatsApp Cloud, OpenAI, Advbox.

## Referência técnica (padrões, não código)

Conversa Hub em produção — ver `docs/FROM_CONVERSA_HUB.md`.
