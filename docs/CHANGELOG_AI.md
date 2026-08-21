# CHANGELOG_AI — IR Consultoria

## 2026-08-21 — Handoff Leadgen travado

- `docs/HANDOFF_CODEX_LEADGEN_2026-08-21.md`: webhook Test OK + subscribed_apps OK, fills reais só na Central; bypass `meta-pull-leads` parado em token inválido na cola.
- Lead Ads endurecido para produção: `IR_META_PAGE_TOKEN` separado do token WhatsApp, `fetchLeadgenDetails` prefere o Page Token com `leads_retrieval`, `meta-pull-leads` aceita token por env ou arquivo (`PAGE_TOKEN_FILE=/tmp/page_token.txt`), sanitiza aspas/quebras/JSON/URL e valida `me?fields=id,name` antes de puxar leads. O pull agora preserva `raw_payload.parsed_form` com nome, telefone, email, resposta médico(a) e raw fields, mantendo o contexto essencial do formulário antes de enfileirar o template `contato_inicial`.
- Como fills reais continuam chegando só na Central de Leads, foi criado o fallback automático `meta-lead-pull-worker`: com `IR_META_LEAD_PULL_WORKER_ENABLED=true`, `IR_META_PAGE_TOKEN` e `IR_META_FORM_IDS`, a API consulta periodicamente os formulários na Graph, ingere apenas leads novos por `meta_leadgen_id` e acorda o worker de template. O script manual `meta:pull-leads` passou a usar o mesmo serviço do worker.
- A abertura livre após o aceite do template foi humanizada para WhatsApp: saudação, apresentação, explicação objetiva e pergunta agora saem em blocos curtos separados por linhas em branco, com copy revisada para evitar parágrafo corrido e manter “Restituição do INSS” sem confundir com Imposto de Renda.

## 2026-08-20 — Script `meta:pull-leads` (bypass webhook)

- `scripts/meta-pull-leads.ts`: com `PAGE_TOKEN`, lê leads do form na Graph e chama `ingestLead` + worker (desbloqueia quando Lead Center tem lead e o webhook Meta não entrega). Form ID observado na Central: `1444863843996760`.

## 2026-08-20 — Script `meta:subscribe-leadgen` (Page → leadgen)

- `scripts/meta-subscribe-leadgen.sh` + `npm run meta:subscribe-leadgen`: com `PAGE_TOKEN` na sessão SSH, faz `POST /{page-id}/subscribed_apps` e lista apps/leads (sem colar token no chat).

## 2026-08-20 — Dashboard full-width, nomes e origem META/Orgânico

- Dashboard deixa de ficar “cortado” (`max-width: 1280px` removido). Conversas e dashboard mostram nome do lead (join por `lead_id`/telefone); Origem vira **META** (anúncio) ou **Orgânico** (teste/inbound/live), com **Importação** para CSV. Mobile: grid do dashboard em 1 coluna, lista/scroll e tab bar ajustados. Template worker passa a vincular `lead_id` na conversa.

## 2026-08-20 — Dashboard Lis-like e scroll da conversa

- Dashboard do painel IR redesenhado no padrão operacional da Lis: KPIs no topo, gráfico de conversas por dia, lista de qualificados recentes, distribuição de status, funil IR e sinais de operação/integrações, sem métricas de reunião/agenda. Ao abrir uma conversa, a thread agora rola automaticamente para a última mensagem, mantendo o composer fixo no rodapé.

## 2026-08-20 — Template `contato_inicial` e contexto de cadastro

- Template inicial trocado para `contato_inicial` no config/env local, dispatcher e worker; aceite/opt-out passam a reconhecer os botões do novo modelo (“Sim” / “Não tenho mais interesse”). O webhook de Lead Ads agora extrai `field_data` do formulário e preserva nome, telefone, email e resposta “é médico(a)” em `raw_payload.parsed_form`; esses dados entram como contexto do agente para evitar pedir informações repetidas e para encaminhar humano quando o cadastro indicar não médico(a). Takeover `waiting_human` ficou silencioso inclusive em opt-out (registra e fecha sem resposta automática). Mídias: inbound de áudio passou a ser aceito como mídia armazenável, e o painel ganhou envio humano de imagem, áudio, vídeo ou documento pela conversa pausada.

## 2026-08-20 — Refinamento visual para paridade com Lis

- Painel IR refinado para ficar mais próximo do UX operacional da Lis: Conversas agora ocupa a tela como inbox principal sem cabeçalho duplicado, com filtros/toolbar densos, thread, ações de pausar/devolver IA e composer humano no mesmo padrão visual da Lis. Dashboard, Leads e Reaquecer ganharam o mesmo frame de conteúdo, cards/tabelas/badges e espaçamentos operacionais. Mantido isolamento completo: sem Calendar, Meet, reuniões, disponibilidade, secrets ou backend da Lis.
- Ajuste após validação visual: a página Conversas deixou de ser split view e passou a seguir a estrutura real da Lis: lista em tabela full-screen primeiro e detalhe em tela separada ao clicar em Abrir, com seta voltar, timeline, composer por estado da IA, painel lateral de dados/análise/documentos e prévia da última mensagem na lista. Backend IR enriquece `/conversations` com `last_message_text`/`last_message_at`, sem tocar em WABA/env/backend da Lis.
- Corrigido o corte da timeline no detalhe da conversa: a thread agora rola internamente e o composer permanece no rodapé do detalhe, como na Lis. A aba Configuração deixou de mostrar itens técnicos como `IR_PANEL_*`, webhooks e teste WhatsApp, e passou a ser uma tela visual de Configuração do Agente no padrão da Lis: informações básicas, system prompt, instruções, parâmetros da IA, recuperação automática/follow-up, RAG e barra fixa de salvar. Persistência backend dessas configurações fica para a próxima etapa.

## 2026-08-20 — WhatsApp mais humano e qualificação objetiva

- Ajustado o fluxo conversacional do agente: quando o lead inicia sem cadastro/nome, a IA agora cumprimenta e se apresenta antes de pedir o nome; após o template, a abertura usa saudação humana e pergunta se o lead já conhecia a Restituição do INSS. A qualificação foi reduzida para a pergunta essencial sobre dois ou mais vínculos/instituições no mesmo período, com CNIS como próximo passo mesmo quando a chance parece baixa. Também foi endurecido o tratamento anti-golpe sem inventar site/CNPJ/OAB/endereço e removida a repetição entre a mensagem que pede CNIS e a legenda do PDF.

## 2026-08-19 — Frontend do painel no padrão visual da Lis

- Painel IR redesenhado para ficar visualmente alinhado ao Conversa Hub/Lis: tokens oklch, Inter Tight, JetBrains Mono, sidebar 220px com ícones, login split, cards operacionais, tabela densa, inbox com filtros/busca, thread, composer, takeover e painel lateral de documentos. Mantido Vite/React em `panel/`, build em `dist/panel`, auth por cookie HttpOnly e APIs `/api/ir/panel/*`; sem páginas de reunião, horários, Calendar ou Meet.

## 2026-08-19 — Login: senha vazia não bloqueia o token

- `IR_PANEL_LOGIN_PASSWORD=` (vazio) deixava de usar `IR_PANEL_TOKEN`. Agora cai no token. A senha digitada também é aparada (espaço/quebra de linha).

## 2026-08-19 — Login do painel (cookie, como a Lis)

- Tela de usuário + senha; sessão HttpOnly `ir_panel_session` (12h). Credenciais só no backend (`IR_PANEL_LOGIN_USER` / `IR_PANEL_LOGIN_PASSWORD`; se a senha não existir, usa `IR_PANEL_TOKEN` já na VPS).
- Removido o campo de colar token no Config. Header `x-ir-panel-token` continua só para scripts (`smoke.sh`).
## 2026-08-19 — Painel no domínio ir.

- Express serve `dist/panel` em `https://ir.meuanalistacrm.app` (sem Vercel; Lis intocada). Deploy: `npm run panel:build` na VPS após o sync.
- Configuração mostra URLs de webhook WhatsApp e Lead Ads. Webhook de leads dá 200 na hora e processa depois.

## 2026-08-19 — PDF passo a passo do CNIS

- Depois do pedido de CNIS, o agente envia `assets/cnis-passo-a-passo.pdf` (uma vez por conversa) com legenda: opção certa + “se tiver dificuldade, pergunte”.

## 2026-08-19 — CNIS: opção com remunerações

- Meu INSS: orientar **“Vínculos, contribuições e remunerações”**. Só “Vínculos e contribuições” = extrato incompleto e triagem errada. Prompt, knowledge, fallback e checklist alinhados.

## 2026-08-19 — Tratamento Dr(a)., abertura da restituição, ACK rápido

- Sempre Dr(a). {Nome}; se o cadastro não tiver nome, pergunta antes de seguir e grava.
- Primeira mensagem explica Restituição do INSS (≠ IR) e pergunta se o lead já conhecia; depois avisa as perguntas da análise gratuita.
- Webhook WhatsApp dá 200 na hora e processa depois (médico responde pouco — cada reply precisa sair rápido). Dedup por `external_message_id`.
- Toda resposta deve terminar com pergunta/próximo passo (não deixar o fio morrer).

## 2026-08-19 — Takeover silencia o próximo “oi”

- Reply humano no painel (`Oi tudo bem?`) põe `waiting_human`. A próxima mensagem do celular não ganha resposta de bot até **Devolver ao agente**. Diagnóstico: `npm run check:inbox`.

## 2026-08-19 — Restart VPS: curl imediato na 3010

- `pm2 restart ir-consultoria-api` deixa o processo `online` antes do `tsx` escutar. `curl` na hora = connection refused; 2–5s depois o health sobe. Lis `:9000` ok. Health público `ir.` ok após o boot.

## 2026-08-19 — Teste no WhatsApp pessoal + follow-ups

- Painel → Configuração: botão envia `primeiro_contato` para o número informado e reabre a conversa em `awaiting_first_reply` (clique em Sim testa a abertura).
- Drip 24h: nomes `ir_confianca` / `ir_explica_inss`; step 2 padrão em 24h; worker ainda off até templates aprovados na Meta.
- Lembrete dentro da janela (`IR_INWINDOW_NUDGE_ENABLED`, off): 1 texto se o lead sumir ~4h após a última pergunta.
- Drip passa `{{1}}` (primeiro nome) na Graph — antes o envio falharia em template com variável.

## 2026-08-19 — Abertura após Sim do template

- Primeiro aceite: texto **explicativo e curto** (OpenAI, ~450 caracteres) com teto + sem garantia + pedido para perguntar. Fallback de uma linha se o modelo falhar. Não é bloco fixo longo.

## 2026-08-19 — Cérebro operacional v1.1 (conhecimento IR)

- Base completa em `prompts/knowledge/IR_CONSULTORIA_CEREBRO_AGENTE.md`.
- Runtime enxuto em `prompts/agent-system-prompt.md` (sem tools inventadas; alegações 2.000 médicos / R$ 25 mi / “maior do Brasil” **off** até aprovação).
- Qualificação e checklist: CNIS (“Vínculos, contribuições e remunerações”) na triagem; DIRF ≠ DIRPF.
- `REQUIRED_DOCUMENT_TYPES` = `cnis`.

## 2026-08-19 — Cérebro do agente lê o markdown

- `generateAgentReply` carrega `prompts/agent-system-prompt.md` + `docs/QUALIFICATION_QUESTIONS.md` (não o parágrafo curto no TS).
- Edição local vale no próximo “Oi” com `api:dev`. Produção só depois de sync VPS + restart `ir-consultoria-api`.
- Proibido o cumprimento genérico “Como posso ajudar você hoje?”.

## 2026-08-19 — Painel: Salvar token recarrega a lista

- Configuração → Salvar agora chama refresh. Antes o primeiro load ia sem token e Conversas ficava vazia sem erro (401 engolido).

## 2026-08-19 — Inbound WhatsApp em produção

- Webhook IR + HMAC + campo `messages` OK.
- Envio falhava com `(#133010) Account not registered`: `IR_META_PHONE_NUMBER_ID` no env era o ID errado (não o Phone number ID da API Setup da IR). WABA ID é outro campo.
- Após gravar os IDs reais na VPS e `pm2 restart ir-consultoria-api --update-env`, “Oi” recebe resposta no celular.

## 2026-08-19 — check:webhook contra URL pública

- O script usava `IR_APP_ENV` do Mac (`development`) e esperava 403≠200 no POST sem assinatura.
- Alvo remoto (`ir.`) agora é tratado como produção: 403 sem assinatura é sucesso.


- VPS `srv1513539`: PM2 `ir-consultoria-api` :3010 + CNAME `ir` → túnel `lis-agent`.
- Health público igual ao local; `vec` e `:9000` continuam `{"status":"ok"}`.
- Túnel é PM2 `cloudflare-tunnel` (não systemd). Ingress local YAML; catch-all 404.
- Lis na porta **9000** (não 3001). `pm2 kill` na VPS derrubou a Lis; restore `pm2 resurrect`.

## 2026-08-19 — Guia humano do deploy (Bloco A fora da VPS)

- `docs/DEPLOY_HUMANO.md`: Cloudflare/Vercel em cliques, sem jargão; VPS e Meta só depois.
- Fora da VPS não se escreve código: um registro A `ir` copiando o IP/proxy do `vec`; Vercel da Lis intocada.
- Print da VPS (2026-08-19): Lis real em `localhost:9000`; `cloudflared` systemd `inactive` (procurar o processo certo; **não** dar start). Catch-all do túnel já é 404.

## 2026-08-18 — Preparação da VPS ao lado da Lis (sem tocar na Lis)

- DNS verificado: `*.meuanalistacrm.app` é wildcard proxied no Cloudflare e hoje `ir.` cai na
  **Vercel** (`404 DEPLOYMENT_NOT_FOUND`). Precisa registro **explícito** `ir` → IP da VPS;
  documentado em `DEPLOY_VPS_E_META.md` §3.-1.
- `scripts/vps-audit.sh` — auditoria somente leitura (`ssh HOST 'bash -s' < ...`): PM2/Lis online,
  3010 livre, memória, Node >= 20, `server_name`/`ssl_certificate` do nginx, `nginx -t` de baseline, ufw.
- `sync-to-vps.sh`: recusa destino que não termine em `/ir-consultoria` (com `--delete`, um
  `IR_VPS_DEST` errado apagaria a Lis), suporta `IR_VPS_DRY_RUN=1` e protege `.env*` mantendo `.env.example`.
- `tsx` movido para `dependencies` — `api:start` usa tsx em produção; com ele em devDependencies
  um `npm install --omit=dev` na VPS quebraria o boot.
- Produção escuta só `127.0.0.1:3010` (`IR_BIND_ADDRESS` para mudar): a porta deixa de ser
  alcançável pelo IP da VPS mesmo sem firewall.
- `ecosystem.config.cjs`: `fork`/1 instância (cluster duplicaria os workers), `tsx` chamado direto
  (evita npm órfão segurando a porta), `max_memory_restart` e log com timestamp.
- Alias `GET /api/ir/health` para o arranjo de prefixo no host da Lis.
- `client_max_body_size 10m` no nginx documentado (import de CSV de 5 MB tomaria 413 no default).

## 2026-08-18 — Hardening para tráfego real: assinatura + fila persistida

- `middleware/meta-signature.ts`: valida `x-hub-signature-256` (HMAC do corpo bruto,
  comparação timing-safe) nos dois webhooks. `IR_META_APP_SECRET` estava no config e
  nunca era usado — qualquer POST na URL criava lead e disparava template pago.
  Fora de produção, requisição sem assinatura ainda passa (curl / `smoke.sh`);
  assinatura errada é 403 em qualquer ambiente. `IR_META_APP_SECRET` agora é
  obrigatório em produção (`assertProductionSecrets`).
- `scripts/check-webhook-signature.ts` + `npm run check:webhook` — payload de
  `statuses` vazio, não cria dado; serve para validar a VPS depois.
- Fila do template inicial deixou de ser array em memória: `claimLeadForTemplate`
  reserva o lead no banco (`template_queued` → `template_sending`, atômico via
  `eq("status")`), então restart/deploy não perde mais lead pago.
- Falha transitória volta para `template_queued` com pausa de 60s (antes o lead era
  simplesmente descartado).
- `recoverStaleClaims` (boot + 1x/min): `template_sending` parado há 15 min volta para a
  fila; se a conversa já registra template `sent`, marca `template_sent` em vez de
  reenviar (evita mensagem duplicada e custo Meta).
- `scripts/check-template-queue.ts` + `npm run check:queue` — lead sintético cobre reserva,
  reserva dupla, detecção de travamento e devolução; aborta se a API estiver no ar ou se
  houver lead real na fila, e apaga o lead de teste no fim.

## 2026-08-18 — OpenAI ligada + template persistido na conversa

- `IR_OPENAI_API_KEY` configurada; health `openai: true`.
- `scripts/check-agent.ts` + `npm run check:agent` — testa o prompt sem custo Meta.
- `template-copy.ts`: cópia dos templates aprovados para histórico/painel/contexto.
- Template inicial e drip agora gravam `ir_messages` + `template_name/status` na conversa
  (antes o agente respondia "como posso ajudar?" por não ter contexto).
- `ir_template_drip_jobs.conversation_id` preenchido no agendamento.

## 2026-08-18 — Botões do template + `primeiro_contato` aprovado

- Webhook lê `button.text` / `interactive.button_reply` (antes só `text.body` → clique chegava vazio).
- Opt-out reconhece "não tenho interesse" / "sem interesse" / "descadastrar".
- Prompt: público principal médicos (acima do teto por múltiplos vínculos).
- `META_OUTREACH.md`: template #1 documentado como aprovado com os 2 botões.

## 2026-08-18 — Pipeline de documentos (Fase 5)

- `downloadWhatsAppMedia` (Graph + header Bearer no CDN).
- `services/documents.ts` — sha256, upload no bucket `ir-documents`, `ir_documents`, checklist obrigatório (identity/address_proof/inss_statement).
- `db/cases.ts` — caso criado na 1ª mídia; status `documents_partial|documents_complete`.
- Webhook passa `media_id`/caption/filename (antes descartava).
- Orquestrador salva mídia e responde com pendências; completo → `waiting_human`.
- Painel: faixa de documentos por conversa + URL assinada (5 min).

## 2026-08-18 — Migrations validadas + check:db

- `scripts/check-db.ts` + `npm run check:db` — verifica as 11 tabelas `ir_*` por migration.
- Confirmado: 0001/0002/0003 aplicadas (`ir_template_drip_jobs` ok).
- Docs: 0003 sai de pendência; `IR_OPENAI_API_KEY` vazio entra em KNOWN_ISSUES.

## 2026-08-17 — Reheat decide + reply humano

- `POST /reheat/:id/decide` (approved|rejected); template reativação só se `action=reheat` + `IR_WHATSAPP_TEMPLATE_REHEAT`.
- Inbox: composer humano, takeover, devolver ao agente (`qualifying`).
- Orquestrador silencioso em `waiting_human` (opt-out ainda fecha).
- Próximo: 0003 no Supabase; E2E Meta/VPS; docs + Advbox.

## 2026-08-12 — Import CSV + drip real + reheat + inbox

- `whatsapp-csv-import` + `POST /api/ir/panel/imports` (CSV phone/name/last_message…).
- Sample `samples/whatsapp-history-sample.csv`.
- `drip.ts` + schedule após template inicial; `follow-up-worker` envia steps 2/3; cancel no 1º reply/opt-out.
- `reheat-scorer` + `POST /reheat/run`; painel botão “Rodar score”.
- Inbox: `GET /conversations` + messages + takeover `waiting_human`.
- Env: `IR_WHATSAPP_TEMPLATE_TRUST|EXPLAIN`, `IR_DRIP_STEP*_HOURS`.
- Próximo: migration 0003 no Supabase; templates Meta; E2E VPS.

## 2026-08-12 — Confiança + drip (INSS ≠ IR / anti-golpe)

- `docs/TRUST_AND_DRIP.md` — princípios + cadência templates + reheat humano.
- Migration `0003_template_drip.sql` (`ir_template_drip_jobs`).
- Stub `follow-up-worker`; prompt + META_OUTREACH alinhados à desconfiança do lead.
- Próximo: parser import + job reheat + drip real pós-aprovação Meta.

## 2026-08-12 — Cérebro produto: modelos + reheat + painel Lis-like

- `docs/AI_MODELS.md` — mapa de modelos por função (Cursor + runtime).
- `docs/WHATSAPP_HISTORY_AND_REHEAT.md` + migration `0002` (imports/scores).
- Painel: shell sidebar (Dashboard/Leads/Conversas/Reaquecer/Importar/Config).
- API panel: `GET /reheat`, `GET /imports` (graceful se tabela ausente).
- `IR_OPENAI_REHEAT_MODEL` no config / `.env.example`.

## 2026-08-12 — Orquestrador + VPS prep (enquanto Meta aprova)

- Persistência `ir_conversations` / `ir_messages` no inbound WhatsApp.
- Respostas: opt-out, humano, OpenAI (se `IR_OPENAI_API_KEY`) ou fallback de qualificação/docs.
- `sendWhatsAppText` na Graph API (janela 24h).
- `docs/QUALIFICATION_QUESTIONS.md`, `scripts/sync-to-vps.sh` (`npm run sync:vps`).

## 2026-08-12 — Webhook WhatsApp verificado (local)

- Meta Verify and save OK via localtunnel → API `:3010`.
- Health: supabase + metaWhatsApp + metaGraph true.
- Próximo: messages subscribed, teste template, VPS (URL definitiva).

## 2026-08-12 — Guia Meta + check:env

- `docs/META_SETUP_PASSO_A_PASSO.md` — passo a passo Meta (WABA, template, webhooks, ngrok).
- `scripts/check-env.sh` + `npm run check:env` — mostra o que falta no `.env.local`.

## 2026-08-12 — .env Supabase + fix client Node 20

- `.env.local` preenchido com credenciais do mesmo projeto Supabase da Lis (prefixo `IR_`).
- `backend/services/supabase.ts`: pacote `ws` para Node 20 + Supabase client.

## 2026-08-12 — Fase 1: Supabase + Meta Graph + deploy helpers

- `backend/services/supabase.ts`, `meta-graph.ts`, `db/leads.ts`, `db/audit.ts`.
- Lead ingestion persiste em `ir_leads` quando Supabase configurado; dedupe + audit.
- Template dispatcher usa Graph API real (stub se credenciais ausentes).
- Meta-leads webhook busca leadgen na Graph quando campos faltam.
- Painel: `/api/ir/panel/status`, `/leads`, `/cases` com fallback.
- Health reporta integrações (supabase, metaWhatsApp, metaGraph).
- `ecosystem.config.cjs`, `scripts/smoke.sh`, `docs/nginx/ir.meuanalistacrm.app.conf`.

## 2026-08-11 — Guia Meta + VPS (Lis intacta)

- Criado `docs/DEPLOY_VPS_E_META.md`: recomendação (repo/PM2/WABA isolados; não multi-tenant no conversa-hub).
- Alvo: `ir.meuanalistacrm.app` → PM2 `ir-consultoria-api` → :3010; Lis em `vec`/:3001 sem mudança.
- Passo a passo Meta (App, WABA, número, templates, Lead Ads) + nginx/PM2/DNS/rollback.

## 2026-08-11 — Scaffold Fase 1 (API + painel)

- Criados `backend/` (Express/TS), `panel/` (Vite/React), `supabase/migrations/0001_ir_schema_draft.sql`, `.env.example`.
- Rotas: `/api/health`, `/api/ir/webhooks/meta-leads`, `/api/ir/webhooks/whatsapp`, `/api/ir/panel/*` (stubs).
- Stubs: lead-ingestion, template-dispatcher, conversation-orchestrator, template-worker.
- Sem Calendar/meeting-scheduler; prefixo env `IR_`; porta API 3010.

## 2026-08-11 — Bootstrap do projeto

- Criado repositório em `/Users/rodrigolemos/Documents/IR-CONSULTORIA`.
- Documentação de arquitetura, fluxos, modelo de dados, env, checklist, outreach Meta, prompt draft.
- Registro no Brain (projeto `ir-consultoria`).
- Decisão: ativo pós-formulário; sem Calendar; docs → Advbox.
