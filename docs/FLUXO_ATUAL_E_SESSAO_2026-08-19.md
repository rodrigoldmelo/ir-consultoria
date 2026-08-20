# IR Consultoria — Relatório 19/08/2026

Documento para o vault (Codex / Obsidian). Sem secrets.
Repo: `/Users/rodrigolemos/Documents/IR-CONSULTORIA`
Produção: `https://ir.meuanalistacrm.app`

---

## 1. O que é este projeto

Agente de WhatsApp **ativo** da IR Consultoria para **análise de indício de Restituição do INSS** (médicos). A decisão jurídica final é **sempre humana**.

Não é restituição de Imposto de Renda. Não agenda reunião. Não usa Google Calendar / Meet. Não compartilha WABA, número, templates nem painel da Lis (Vieira & Cavalcanti / Conversa Hub).

Funil-alvo:

```text
formulário (Lead Ads) → template WhatsApp aprovado → conversa → documentos (CNIS) → Advbox + tarefa humana
```

---

## 2. Isolamento da Lis (regra de ouro)

| | Lis / Conversa Hub | IR Consultoria |
|--|--|--|
| Repo | `/Users/rodrigolemos/Documents/CONVERSA-HUB` | `/Users/rodrigolemos/Documents/IR-CONSULTORIA` |
| API PM2 | `conversa-hub-api` → `localhost:9000` | `ir-consultoria-api` → `127.0.0.1:3010` |
| Público | `https://vec.meuanalistacrm.app` | `https://ir.meuanalistacrm.app` |
| Painel | Vercel `lis.meuanalistacrm.app` | **mesmo host da API** (`ir.`) |
| WhatsApp | WABA / número da V&C | WABA / número **próprios** |
| Banco | tabelas da Lis | schema `ir_*` (mesmo projeto Supabase, tabelas separadas) |
| Proibido | — | Calendar, meeting-scheduler, copiar `.env` da Lis, `pm2 kill`, `pm2 restart all` |

Túnel Cloudflare: processo PM2 `cloudflare-tunnel` (UUID `lis-agent`). **Não** ligar systemd `cloudflared` (está inactive de propósito). Ingress: `lis`/`vec` → `:9000`; `ir` → `:3010`; catch-all 404.

---

## 3. Fluxo atual (como o produto funciona hoje)

### 3.1 Entrada de lead (ainda não E2E de anúncio)

Código pronto: webhook `POST /api/ir/webhooks/meta-leads`.

1. Meta Lead Ads envia o lead (ACK 200 na hora; processa depois).
2. Assinatura HMAC `x-hub-signature-256` obrigatória em produção.
3. Lead grava em `ir_leads` (dedup por `meta_leadgen_id` / telefone).
4. Status `template_queued`.

**Humano ainda precisa:** Instant Form da IR com nome, telefone, opt-in WhatsApp; inscrever campo `leadgen` no app Meta da IR; URL `https://ir.meuanalistacrm.app/api/ir/webhooks/meta-leads`.

Atalho de teste (já no painel): Configuração → Enviar primeiro contato (número pessoal). Cria/reabre lead sintético e enfileira o template.

### 3.2 Template inicial (já aprovado na Meta)

Worker `backend/workers/template-worker.ts` (ligado):

```text
template_queued → template_sending → dispara Graph → template_sent + conversa awaiting_first_reply
```

- Template: `primeiro_contato` (`IR_WHATSAPP_TEMPLATE_INITIAL`), idioma `pt_BR`, variável `{{1}}` = nome.
- Botões: **Sim** / **Não tenho interesse**.
- Fila **no banco** (sobrevive a restart). Reserva atômica. Travamento de 15 min volta para a fila. Não reenvia se o template já foi `sent`.
- Teste no painel reabre a conversa em `awaiting_first_reply` de propósito (para o Sim gerar a abertura).

Erro já resolvido hoje: `(#133010) Account not registered` = `IR_META_PHONE_NUMBER_ID` errado (não é o WABA ID).

### 3.3 Primeira resposta do médico (janela 24h abre)

Webhook `POST /api/ir/webhooks/whatsapp`:

1. ACK **200 imediatamente**, processa em seguida (médico responde pouco; atraso mata a conversa).
2. Dedup por `external_message_id`.
3. HMAC igual ao de leads.
4. Clique **Sim** com conversa em `awaiting_first_reply` → `generateFirstContactReply`: explica Restituição do INSS (≠ IR, sem garantia de valor, teto conceitual), pergunta se já conhecia o tema.
5. Clique **Não tenho interesse** → opt-out.
6. Sempre tratar como **Dr(a). {Nome}**. Se o cadastro não tiver nome, o agente pergunta e grava (`extractGivenName` / `updateLeadName`; stub `wa-{digits}` se o lead ainda não existir).

Proibido no agente: “Como posso ajudar você hoje?”; alegações “2.000 médicos / R$ 25 mi / maior do Brasil” (off até aprovação); prometer direito, valor ou prazo.

### 3.4 Qualificação (uma pergunta por vez)

Ordem em `docs/QUALIFICATION_QUESTIONS.md`:

0. Nome (se faltar)
1. Já conhecia a Restituição do INSS?
2. Aviso: virão perguntas da análise gratuita
3. Contribuições da própria atividade como médico?
4. Dois ou mais vínculos ao mesmo tempo?
5. Tipos (CLT, cooperativa, município, autônomo, PJ)
6. Anos aproximados
7. Sabe se houve INSS nesses vínculos?
8. Já analisaram / processo em curso?
9. Pedido do **CNIS** no Meu INSS, opção **“Vínculos, contribuições e remunerações”** (só “Vínculos e contribuições” = extrato incompleto)

Toda resposta do agente deve terminar com pergunta ou próximo passo.

Pedido de humano só com intenção clara (“falar com uma pessoa”, atendente, advogado) — a palavra “pessoa” sozinha **não** dispara takeover.

### 3.5 Documento CNIS

Quando o agente pede o CNIS, envia **uma vez por conversa** o PDF `assets/cnis-passo-a-passo.pdf` (`backend/services/cnis-guide.ts`, tipo `cnis_guide`), com legenda: opção certa + “se tiver dificuldade, pergunte”.

Mídia inbound → bucket `ir-documents` + `ir_documents` + checklist. Tipo obrigatório hoje: `cnis`. Classificação ainda é palpite pela legenda (modelo de classificação off). Caso criado na primeira mídia.

Fim de funil previsto: `documents_complete` → Advbox + tarefa humana. **Advbox ainda é stub** (API não mapeada).

### 3.6 Takeover humano (painel)

- **Assumir / responder** no painel: status `waiting_human`. O bot **não** responde o próximo “oi” até **Devolver ao agente**.
- Reply humano só funciona **dentro da janela 24h** da Meta (texto livre). Fora da janela a Graph recusa — aí é template de reheat.
- Diagnóstico: `npm run check:inbox`.

### 3.7 Se o lead não responde o template (drip) — código pronto, worker OFF

Cadência (`docs/TRUST_AND_DRIP.md`):

| Quando | O quê | Status |
|--------|--------|--------|
| T0 | `primeiro_contato` | Aprovado e em uso |
| T0 + 24h sem reply | template `ir_confianca` | **Criar na Meta** |
| T0 + 5d sem reply | template `ir_explica_inss` | **Criar na Meta** |
| Na janela, ~4h após última pergunta do bot | texto livre de lembrete | Flag `IR_INWINDOW_NUDGE_ENABLED=false` |

Worker: `backend/workers/follow-up-worker.ts`. Só ligar `IR_FOLLOW_UP_WORKER_ENABLED=true` **depois** dos templates aprovados. Já envia `{{1}}` (primeiro nome) — havia bug sem variável.

Textos oficiais para colar na Meta: `docs/META_OUTREACH.md`.

### 3.8 Histórico antigo / reaquecer

- Import CSV de WhatsApp no painel → `ir_whatsapp_imports`.
- Score gpt-4o → fila **Reaquecer**.
- Humano aprova **um a um**. Skip/rejeitar nunca dispara. Bulk automático = proibido.

---

## 4. Cérebro do agente (arquivos vivos)

| Arquivo | Papel |
|---------|--------|
| `prompts/knowledge/IR_CONSULTORIA_CEREBRO_AGENTE.md` | Base completa de conhecimento (v1.1) |
| `prompts/agent-system-prompt.md` | Runtime (OpenAI carrega isto) |
| `docs/QUALIFICATION_QUESTIONS.md` | Ordem das perguntas |
| `backend/services/openai-agent.ts` | `generateAgentReply` + `generateFirstContactReply` |

Modelos: chat `gpt-4o-mini`; reheat `gpt-4o`; extração `gpt-4o-mini`. Ver `docs/AI_MODELS.md`.

Produção só atualiza o prompt depois de **sync VPS + restart** `ir-consultoria-api`. Local: `npm run api:dev` relê o markdown.

---

## 5. Painel operacional

URL: `https://ir.meuanalistacrm.app` (Express serve `dist/panel`; **sem Vercel** — a Lis continua na Vercel).

Telas: Dashboard, Leads, Conversas (inbox + reply + takeover + docs), Reaquecer, Importar histórico, Configuração (URLs de webhook + teste de template).

### Login (entrega desta sessão, padrão Lis)

- Tela de **usuário + senha** (split screen, cookie HttpOnly `ir_panel_session`, 12h, SameSite=Lax).
- Credenciais **só no `.env` do servidor**. Nada de colar token no browser.
- Rotas: `POST /api/ir/auth/login`, `POST /api/ir/auth/logout`, `GET /api/ir/auth/me`.
- Variáveis: `IR_PANEL_LOGIN_USER` (padrão `admin`), `IR_PANEL_LOGIN_PASSWORD`, `IR_PANEL_SESSION_SECRET` (≥32).
- Se a senha de login não estiver definida, o backend usa o `IR_PANEL_TOKEN` **já existente na VPS** como senha (usuário `admin`). Não precisa editar o `.env` só para o primeiro acesso.
- Header `x-ir-panel-token` permanece só para scripts (`npm run smoke`).

---

## 6. Stack e banco

- Node / Express / TypeScript, React / Vite (painel), Supabase (`ir_*`), Meta WhatsApp Cloud + Lead Ads, OpenAI, Advbox (pendente).
- Migrations aplicadas: **0001, 0002, 0003** (`npm run check:db`). **0004 RLS** pendente.
- Workers: template on; follow-up off; in-window nudge off; Advbox off; classificação de doc off.

---

## 7. O que construímos e desenvolvemos hoje (19/08/2026)

Ordem aproximada do dia, tudo no repo + docs:

1. **Deploy ao lado da Lis sem derrubá-la**
   Health público `ir.` OK. Lis `:9000` / `vec` intactos. Túnel PM2 (não systemd). Nunca `pm2 kill` / `restart all`. Após um `pm2 kill` acidental no passado: `pm2 resurrect`.

2. **Inbound WhatsApp em produção**
   Webhook + HMAC + campo `messages`. Correção do Phone number ID (`#133010`). “Oi” no número da IR passou a receber resposta.

3. **Cérebro operacional v1.1**
   Knowledge + runtime markdown. Agente deixa de usar parágrafo curto no TypeScript. Qualificação e CNIS alinhados. `REQUIRED_DOCUMENT_TYPES = cnis`.

4. **Tratamento Dr(a). + abertura da restituição**
   Sempre Dr(a). {Nome}; se faltar nome, pergunta e grava. Primeira mensagem após Sim explica Restituição do INSS ≠ IR, sem garantia.

5. **ACK rápido nos webhooks**
   WhatsApp e Lead Ads respondem 200 na hora e processam depois. Dedup por `external_message_id`.

6. **CNIS com remunerações + PDF passo a passo**
   Opção Meu INSS correta. PDF enviado uma vez por conversa.

7. **Takeover diagnosticado**
   Reply humano “Oi tudo bem?” punha `waiting_human` e o próximo inbound ficava mudo até Devolver ao agente.

8. **Teste no WhatsApp pessoal pelo painel**
   Botão envia `primeiro_contato` e reabre `awaiting_first_reply`.

9. **Follow-ups prontos (ainda desligados)**
   Nomes `ir_confianca` / `ir_explica_inss`; step 2 em 24h; worker envia `{{1}}`; nudge in-window opcional.

10. **Painel no domínio `ir.`**
    Express serve o front. Deploy extra: `npm run panel:build` na VPS (rsync exclui `dist`). Config mostra URLs de webhook.

11. **Login profissional (esta entrega)**
    Igual à Lis: tela de acesso, cookie de sessão, senha no backend. Fim do “cole o token no Config”.

---

## 8. O que funciona vs o que falta

**Funciona**

- API e painel em `https://ir.meuanalistacrm.app`
- Health, webhooks com HMAC
- Inbound WhatsApp + resposta do agente
- Template `primeiro_contato` (fila persistida)
- Inbox no painel (com o cuidado do takeover)
- Import CSV + fila Reaquecer (código)
- Prompt / knowledge / PDF CNIS no código

**Falta (trabalho atual)**

1. Sync desta versão (login + painel) para a VPS e `panel:build`
2. Criar/aprovar na Meta `ir_confianca` e `ir_explica_inss`; só então ligar o worker de drip
3. Instant Form + webhook `leadgen` (entrada real de anúncio)
4. Critérios Fase 0 (elegibilidade estruturada)
5. Advbox (cliente / caso / tarefa)
6. RLS `ir_*` (migration 0004)
7. Classificador de documento (hoje palpite)
8. Opcional: `IR_INWINDOW_NUDGE_ENABLED=true`

---

## 9. Comandos (humano) — Lis intocada

No Mac (pede senha SSH):

```bash
cd /Users/rodrigolemos/Documents/IR-CONSULTORIA
IR_VPS_HOST=root@187.77.232.209 npm run sync:vps
```

Na VPS:

```bash
cd /opt/ir-consultoria
npm install
npm run panel:build
pm2 restart ir-consultoria-api --update-env
```

Esperar ~3s (o PM2 marca online antes do `tsx` escutar). **Não** `pm2 restart all`. **Não** `pm2 kill`.

Login no painel: usuário `admin` (salvo se `IR_PANEL_LOGIN_USER` for outro). Senha = `IR_PANEL_LOGIN_PASSWORD` ou, se vazio, o valor de `IR_PANEL_TOKEN` que já está no `.env` da VPS. Não colar senha no chat.

---

## 10. Arquivos-chave para a próxima sessão

- `docs/PROJECT_STATUS.md` · `docs/AI_HANDOFF.md` · `docs/NEXT_ACTIONS.md` · `docs/CHANGELOG_AI.md`
- `docs/TRUST_AND_DRIP.md` · `docs/META_OUTREACH.md` · `docs/QUALIFICATION_QUESTIONS.md`
- `prompts/agent-system-prompt.md` · `prompts/knowledge/IR_CONSULTORIA_CEREBRO_AGENTE.md`
- `backend/services/conversation-orchestrator.ts` · `backend/services/panel-session.ts`
- `backend/routes/auth.ts` · `panel/src/Login.tsx`

Cursor = cérebro/orquestrador deste produto. Commit só se o usuário pedir. Secrets nunca no git.
