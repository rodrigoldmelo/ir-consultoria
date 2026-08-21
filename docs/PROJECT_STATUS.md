# PROJECT STATUS — IR Consultoria
**Atualizado:** 2026-08-21

## Status

**API em produção** em `https://ir.meuanalistacrm.app` (PM2 `ir-consultoria-api` :3010, túnel Cloudflare). Painel no mesmo domínio, com **login e senha** (cookie HttpOnly; credenciais só no `.env` do servidor) e frontend em refinamento de paridade visual com a Lis, adaptado ao funil IR/CNIS e sem reunião/Calendar. Dashboard segue o padrão operacional da Lis com KPIs, gráficos e listas adaptados à IR. A tela Conversas segue a UX da Lis: lista full-screen em tabela e detalhe separado ao abrir, com seta voltar, timeline com scroll interno que abre na última mensagem, ações de pausar/devolver IA, resposta humana, responder mensagem com contexto, apagar mensagens enviadas do painel, painel lateral, documentos, envio humano separado de áudio/imagem/vídeo/arquivo quando a IA está pausada e botão **Enviar primeiro contato** para conversas importadas sem histórico. Configuração agora é uma tela visual de Configuração do Agente no padrão da Lis (system prompt, instruções, parâmetros, follow-up e RAG), ainda sem persistência backend própria. Agente WhatsApp ajustado para saudação humana e qualificação objetiva: template inicial `contato_inicial` → conhecimento do assunto → pergunta essencial sobre dois ou mais vínculos simultâneos → CNIS. Dados do formulário (nome, email, telefone e resposta médico(a)) entram como contexto do agente. Takeover `waiting_human` silencia qualquer resposta automática até devolução explícita. CNIS enviado após pedido de documento é classificado por contexto quando o WhatsApp não traz filename/legenda útil. Lis em `vec` / `:9000` intacta. Inbound WhatsApp E2E OK (2026-08-19) após corrigir `IR_META_PHONE_NUMBER_ID` (erro 133010). Bloqueios: templates drip Meta, Advbox, critérios Fase 0, módulo de disparos em massa com auditoria/custos e leitura/OCR real do conteúdo dos documentos.

## Produto

### Núcleo (ativo)
Formulário → template WA → conversa → docs → Advbox + tarefa humana.

### Expansões (código pronto, E2E pendente Meta)
1. Import histórico WhatsApp (CSV)
2. Agente Reaquecer / Reanálise (score + humano aprova/rejeita)
3. Painel operacional Lis-like (Dashboard, Conversas, Leads, Reaquecer, Importar histórico, Configuração)

## O que NÃO faz

- Calendar / Meet / reunião
- Decisão jurídica definitiva automática
- Disparo em massa sem aprovação humana

## Modelos (resumo)

Ver `docs/AI_MODELS.md` — chat `gpt-4o-mini`; reheat `gpt-4o`; Cursor Opus/Composer.

## Estrutura

| Path | Função |
|------|--------|
| `backend/` | Express, webhooks, orquestrador, panel API |
| `panel/` | Vite/React — shell operacional Lis-like; build em `dist/panel` |
| `docs/AI_MODELS.md` | Distribuição de modelos |
| `docs/WHATSAPP_HISTORY_AND_REHEAT.md` | Import + reaquecer |
| `docs/FLUXO_ATUAL_E_SESSAO_2026-08-19.md` | Relatório do dia + fluxo atual (Obsidian) |
| `supabase/migrations/` | `ir_*` + import/reheat + drip |

## Ambiente

| Item | Valor |
|------|-------|
| Painel (produção) | `https://ir.meuanalistacrm.app` (login cookie, credenciais no `.env` da VPS) |
| API (produção) | `https://ir.meuanalistacrm.app/api/health` |
| Local | `npm run api:dev` :3010 · `npm run panel:dev` :5174 |
