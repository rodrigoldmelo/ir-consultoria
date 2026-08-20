# Prompt para o Codex — visual do painel IR = Lis

Cole o bloco abaixo no Codex, com o workspace em `/Users/rodrigolemos/Documents/IR-CONSULTORIA`.

---

```text
Tarefa: deixar o FRONTEND do painel IR Consultoria visualmente idêntico ao painel da Lis (Conversa Hub). Só adaptar o que o produto IR não tem (reuniões, horários, Calendar).

## Repos (não misturar)

- TRABALHAR SÓ EM: /Users/rodrigolemos/Documents/IR-CONSULTORIA
- REFERÊNCIA VISUAL (só ler, NÃO editar, NÃO copiar .env, NÃO copiar backend): /Users/rodrigolemos/Documents/CONVERSA-HUB

A IR é um produto isolado. Sem Google Calendar, Meet, meeting-scheduler, disponibilidade. Sem secrets da Lis. Commit só se eu pedir. Não commitar .env.

## Como a Lis parece (copiar o visual)

Referência principal:
- /Users/rodrigolemos/Documents/CONVERSA-HUB/src/styles.css (tokens Claude/oklch, Inter Tight, JetBrains Mono)
- /Users/rodrigolemos/Documents/CONVERSA-HUB/src/components/app-sidebar.tsx (sidebar 220px, marca, nav com ícones lucide, rodapé avatar + Sair)
- /Users/rodrigolemos/Documents/CONVERSA-HUB/public/login.html (login split: marca escura à esquerda, formulário à direita)
- /Users/rodrigolemos/Documents/CONVERSA-HUB/src/routes/conversas.index.tsx (lista + filtros + busca)
- /Users/rodrigolemos/Documents/CONVERSA-HUB/src/routes/conversas.$id.tsx (inbox: thread + composer + painel lateral)
- /Users/rodrigolemos/Documents/CONVERSA-HUB/src/routes/__root.tsx (shell: sidebar + main)
- /Users/rodrigolemos/Documents/CONVERSA-HUB/docs/design/conversa-hub-operacional/conversa-hub.html (mock visual)

Pode trazer para a IR: Tailwind v4, tokens, componentes UI shadcn/lucide necessários, tipografia Inter Tight, sidebar, cards, badges, tabela, inbox. NÃO precisa copiar o TanStack Start/Router da Lis se for mais simples manter Vite + React no `panel/` — o resultado visual é o que importa. Se adotar router, o build TEM que continuar gerando `dist/panel` (`panel/vite.config.ts` → outDir ../dist/panel) porque o Express serve isso em https://ir.meuanalistacrm.app.

## O que a IR já tem (não quebrar)

Painel hoje: `panel/src/` (App.tsx monolítico, Login.tsx, api.ts, styles.css).
Auth: cookie HttpOnly `ir_panel_session`. Login POST /api/ir/auth/login {username,password}, GET /api/ir/auth/me, POST /api/ir/auth/logout. Todas as chamadas do painel: credentials: "include". 401 → tela de login. NÃO voltar a colar IR_PANEL_TOKEN no browser.

APIs existentes (reusar, não inventar URL):
- /api/ir/panel/status, /leads, /conversations, /conversations/:id/messages, /conversations/:id/documents, /documents/:id/url
- takeover, resume, reply
- /reheat, /reheat/run, /reheat/:id/decide
- /imports (GET/POST CSV)
- /test-outreach, /test-drip
- /api/health

Funil IR (copy da UI): formulário → template WhatsApp → conversa → CNIS → Advbox + humano. Sem reunião.

## Navegação Lis → IR

Lis tem: Dashboard, Conversas, Reuniões, Horários, Relatórios, Configuração.

IR deve ter (mesma cara de nav):
1. Dashboard — KPIs da IR (leads, templates, conversas abertas, waiting_human, docs pendentes, status supabase/meta/openai). SEM cards de reunião/agenda.
2. Conversas — inbox igual à Lis (lista + detalhe + takeover / devolver / reply humano + documentos do caso). Filtros pelos STATUS da IR (awaiting_first_reply, qualifying, waiting_documents, waiting_human, opt_out, etc.), NÃO human_required/scheduling/meeting_*.
3. Leads — tabela de ir_leads (hoje já existe).
4. Reaquecer — fila humana aprovar/rejeitar (já existe API).
5. Importar histórico — CSV WhatsApp (já existe).
6. Configuração — webhooks WhatsApp/Lead Ads + teste primeiro_contato / drip. SEM token colável. SEM Calendar.

NÃO criar páginas Reuniões, Horários, Disponibilidade, Google Calendar.
Relatórios da Lis: ou omitir, ou um “Relatórios” mínimo só com números da IR (leads/templates/opt-out) — sem métricas de reunião.

Marca no sidebar: “IR” no ícone, título “IR Consultoria”, subtítulo “Restituição INSS” (não Conversa Hub / Operação Lis / Vieira & Cavalcanti). Login: mesmo layout da Lis, textos da IR. Botão Sair deve chamar POST /api/ir/auth/logout de verdade.

Badge vermelho em Conversas = conversas `waiting_human` (equivalente ao human_required da Lis).

## Regras

- Mudanças mínimas no backend; só se o visual precisar de um campo já existente.
- Português na UI.
- `npm run typecheck` e `npm run panel:build` passando.
- Não mexer em prompts do agente WhatsApp, workers, webhooks, Lis, VPS, CONVERSA-HUB.
- Depois: atualizar docs/CHANGELOG_AI.md (1 parágrafo) e docs/PROJECT_STATUS.md se o painel mudar de estrutura.

Objetivo: abrir o painel IR e sentir que é o mesmo produto visual da Lis, com o funil da Restituição INSS no lugar de reuniões.
```
