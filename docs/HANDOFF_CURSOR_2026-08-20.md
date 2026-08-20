# Handoff para Cursor — IR Consultoria

**Data:** 20/08/2026
**Repo:** `/Users/rodrigolemos/Documents/IR-CONSULTORIA`
**Projeto isolado da Lis:** sim. Nao editar `/Users/rodrigolemos/Documents/CONVERSA-HUB`, nao copiar `.env`, nao usar WABA/Calendar/Meet/meeting-scheduler da Lis.

## Estado curto

Projeto IR Consultoria e um agente WhatsApp ativo para indicio de Restituicao do INSS para medicos. Decisao final e humana. Nao e IR/imposto de renda.

Funil alvo:

```text
Formulario Lead Ads -> template WhatsApp contato_inicial -> conversa -> CNIS -> Advbox + humano
```

Producao esperada:

- Dominio: `https://ir.meuanalistacrm.app`
- PM2: `ir-consultoria-api`
- Porta: `3010`
- Painel servido pelo proprio Express a partir de `dist/panel`
- Lis continua separada em `vec`/`:9000` ou infra propria da Lis, sem alteracao.

## Commit atual

Commit local criado:

```bash
7181a81 Prepare IR Consultoria panel and WhatsApp flow
```

Nao houve push porque o repo nao tem remote `origin` configurado:

```bash
git remote -v
# vazio

git push -u origin main
# fatal: 'origin' does not appear to be a git repository
```

Para push, configurar remote real primeiro:

```bash
git remote add origin <URL_DO_REPO>
git push -u origin main
```

## O que foi desenvolvido nesta rodada

### Frontend/painel

- Painel IR ficou visualmente mais proximo do painel da Lis.
- Login segue por usuario/senha e cookie HttpOnly `ir_panel_session`.
- Nao voltou token colavel no browser.
- Sidebar, login, Conversas, Dashboard e Configuracao foram adaptados ao produto IR.
- Dashboard agora segue composicao operacional da Lis:
  - KPIs no topo.
  - Grafico de conversas por dia.
  - Qualificados recentes.
  - Distribuicao dos status das conversas.
  - Funil IR.
  - Operacao/integracoes.
  - Sem Reunioes, Horarios, Calendar, Meet ou disponibilidade.
- Conversas agora seguem a UX da Lis:
  - Lista full-screen em tabela.
  - Detalhe separado ao clicar em abrir.
  - Timeline com scroll interno.
  - Composer fixo.
  - Ao abrir conversa, rola automaticamente para a ultima mensagem.
  - Painel lateral com dados, analise e documentos.
- Composer humano aparece quando a IA esta pausada (`waiting_human`).
- Painel consegue enviar anexo humano quando IA esta pausada:
  - imagem
  - audio
  - video
  - documento
- Configuracao virou tela visual de agente no estilo Lis:
  - informacoes basicas
  - system prompt
  - instrucoes
  - parametros IA
  - recuperacao/follow-up
  - RAG visual
- Configuracao ainda nao persiste no backend; por enquanto e UI/estrutura visual.

Arquivos principais:

- `panel/src/App.tsx`
- `panel/src/styles.css`
- `panel/src/api.ts`
- `panel/src/types.ts`

### Template inicial

Template inicial trocado de `primeiro_contato` para:

```text
contato_inicial
```

Locais ajustados:

- `backend/config.ts`
- `.env.example`
- `.env.local` localmente, mas `.env.local` esta ignorado e nao deve ser commitado.
- `backend/services/template-copy.ts`
- `backend/services/template-dispatcher.ts`
- `backend/workers/template-worker.ts`
- `scripts/check-agent.ts`
- `docs/META_OUTREACH.md`
- `docs/TRUST_AND_DRIP.md`
- `docs/AI_HANDOFF.md`

O novo template reconhece:

- Botao/Resposta `Sim` como aceite.
- Botao/Resposta `Nao tenho mais interesse` como opt-out.

### Lead Ads / dados do formulario

Webhook existente:

```text
POST /api/ir/webhooks/meta-leads
GET  /api/ir/webhooks/meta-leads
```

Foi reforcado para extrair `field_data` da Meta, alem de campos soltos.

Dados preservados:

- nome
- telefone
- email
- resposta se e medico(a)
- campos crus do formulario

Esses dados vao para:

```ts
raw_payload.parsed_form
```

Nao foram criadas colunas novas no banco agora. Decisao: manter em `raw_payload.parsed_form` por compatibilidade com schema ja aplicado.

Arquivos:

- `backend/routes/webhooks/meta-leads.ts`
- `backend/services/meta-graph.ts`
- `backend/types/index.ts`

### Cerebro/agente WhatsApp

Prompt runtime:

```text
prompts/agent-system-prompt.md
```

Base humana:

```text
prompts/knowledge/IR_CONSULTORIA_CEREBRO_AGENTE.md
```

Fluxo desejado:

1. Saudacao humana.
2. Apresentacao da IR Consultoria.
3. Pergunta se ja conhecia Restituicao do INSS.
4. Se sim: ir direto para pergunta essencial.
5. Se nao: explicacao curta, tecnica e sem juridiques; depois pergunta essencial.
6. Pergunta essencial: se trabalhou ao mesmo tempo em duas ou mais instituicoes/fontes.
7. Se ja informou multiplos vinculos, nao repetir a pergunta; pedir CNIS.
8. CNIS como proximo passo.

Pergunta essencial:

```text
Nos ultimos anos, voce trabalhou ao mesmo tempo em duas ou mais instituicoes (hospitais, clinicas, cooperativas ou orgaos publicos)?
```

O agente agora recebe contexto interno com dados do cadastro:

- nome
- telefone
- email
- medico(a): sim/nao/se informado

Regra: nao pedir novamente dados que vieram do formulario.

Se o formulario indicar que a pessoa nao e medico(a):

- responder com cuidado
- explicar que a analise e voltada principalmente para medicos
- encaminhar para humano
- status vai para `waiting_human`

Arquivos:

- `backend/services/openai-agent.ts`
- `backend/services/conversation-orchestrator.ts`
- `backend/services/post-template-briefing.ts`
- `prompts/agent-system-prompt.md`

### Takeover humano

Status:

```text
waiting_human
```

Regra atual:

- Se o humano clicar em encaminhar/pausar/assumir, a IA nao responde mais.
- A IA so volta a responder depois de `Devolver IA`.
- Mesmo opt-out durante takeover e tratado silenciosamente: registra/fecha, mas nao envia resposta automatica.

Arquivos:

- `backend/services/conversation-orchestrator.ts`
- `backend/routes/panel.ts`
- `panel/src/App.tsx`

### Midias

Recebimento:

- Webhook WhatsApp ja captura texto, botoes, imagem, documento, audio e video.
- Recebimento de PDF/imagem ja existia.
- Audio agora tambem e aceito como midia armazenavel.
- Documentos recebidos criam/atualizam caso e checklist.

Envio:

- CNIS PDF automatico continua pelo fluxo existente.
- Painel ganhou endpoint para envio humano de midia quando IA esta pausada:

```text
POST /api/ir/panel/conversations/:id/media
```

Tipos suportados pelo envio manual:

- image
- audio
- video
- document

Limite atual do endpoint:

```text
3.8 MB
```

Arquivos:

- `backend/services/meta-graph.ts`
- `backend/services/documents.ts`
- `backend/routes/panel.ts`
- `panel/src/api.ts`
- `panel/src/App.tsx`

## Checks executados

Passaram:

```bash
npm run typecheck
npm run panel:build
npm run check:agent
npm run check:webhook
npm run check:db
npm run check:env
git diff --cached --check
```

`check:queue` nao foi concluido porque havia API/worker usando a fila na porta `3010`:

```text
API respondendo na porta 3010. Pare o worker antes (o teste usa a mesma fila).
```

Nao parar processo ativo sem confirmar, para evitar impacto no fluxo real.

## Estado do Git

Apos commit, o status mostra apenas ignorados:

```text
!! .env.local
!! dist/
!! node_modules/
```

Esses itens estao corretamente fora do commit.

## Estado para anuncios

Codigo esta pronto para:

```text
Lead Ads -> /api/ir/webhooks/meta-leads -> ir_leads -> fila template -> contato_inicial -> awaiting_first_reply -> conversa
```

Mas antes de subir anuncios de verdade, confirmar estes pontos externos:

1. Remote Git ou deploy VPS configurado.
2. Codigo atual sincronizado na VPS.
3. `npm install` na VPS se necessario.
4. `npm run panel:build` na VPS.
5. `.env` de producao da IR atualizado com:
   - `IR_WHATSAPP_TEMPLATE_INITIAL=contato_inicial`
   - `IR_TEMPLATE_WORKER_ENABLED=true`
   - `IR_META_PAGE_ID`
   - `IR_META_FORM_IDS` quando o formulario real existir
   - tokens/IDs proprios da IR, nunca da Lis
6. PM2 reiniciado somente para IR:

```bash
pm2 restart ir-consultoria-api --update-env
pm2 save
```

7. Meta:
   - Template `contato_inicial` ativo/aprovado.
   - Instant Form real criado.
   - Opt-in WhatsApp no formulario.
   - App/Page inscritos no evento `leadgen`.
   - Callback Lead Ads apontando para:

```text
https://ir.meuanalistacrm.app/api/ir/webhooks/meta-leads
```

8. WhatsApp webhook apontando para:

```text
https://ir.meuanalistacrm.app/api/ir/webhooks/whatsapp
```

9. Campo `messages` inscrito no webhook WhatsApp.
10. Teste interno com lead real de formulario antes de abrir campanha.

## Pendencias reais

Bloqueiam anuncios 100% automaticos:

- `IR_META_PAGE_ID` ainda estava vazio no check local.
- `IR_META_FORM_IDS` ainda estava vazio; e opcional no codigo, mas recomendado quando o formulario existir.
- Confirmar que o template `contato_inicial` esta aprovado/ativo na Meta.
- Configurar assinatura `leadgen` da Page/Form na Meta.
- Sincronizar/deployar o commit `7181a81` para producao.
- Confirmar `.env` de producao.
- Rodar smoke E2E com um lead de teste vindo do formulario real.

Nao bloqueiam o inicio das conversas, mas seguem pendentes:

- Advbox ainda nao integrado.
- Templates drip `ir_confianca` e `ir_explica_inss` dependem de aprovacao Meta antes de ligar worker.
- RLS Supabase para tabelas `ir_*`.
- Criterios Fase 0 estruturados.
- Classificador de documento.
- Persistencia backend da tela Configuracao do Agente.

## Caminho de deploy sem Git remote

Se nao houver GitHub remoto, usar o sync protegido:

```bash
IR_VPS_HOST=root@IP_DA_VPS IR_VPS_DRY_RUN=1 bash scripts/sync-to-vps.sh
IR_VPS_HOST=root@IP_DA_VPS bash scripts/sync-to-vps.sh
```

O script:

- exclui `.env*`
- exclui `.git`
- exclui `node_modules`
- exclui `dist`
- recusa destino que nao termine em `/ir-consultoria`

Depois, na VPS:

```bash
cd /opt/ir-consultoria
npm install
npm run panel:build
pm2 restart ir-consultoria-api --update-env
pm2 save
curl -sS http://127.0.0.1:3010/api/health
```

Confirmar Lis intacta:

```bash
curl -sS http://127.0.0.1:9000/api/health
```

## Regras absolutas para Cursor

- Trabalhar somente em `/Users/rodrigolemos/Documents/IR-CONSULTORIA`.
- Nao editar Conversa Hub/Lis.
- Nao copiar `.env` da Lis.
- Nao commitar `.env.local`, `dist`, `node_modules` ou secrets.
- Nao adicionar Calendar, Meet, reunioes, horarios, disponibilidade ou meeting-scheduler.
- Commit/push so quando Rodrigo pedir.
- Antes de mexer em deploy, validar remote ou `IR_VPS_HOST`.
- Se for mexer em producao, reiniciar somente `ir-consultoria-api`.

## Arquivos para ler primeiro

```text
AGENTS.md
docs/PROJECT_STATUS.md
docs/CHANGELOG_AI.md
docs/AI_HANDOFF.md
docs/HANDOFF_CURSOR_2026-08-20.md
prompts/agent-system-prompt.md
docs/META_OUTREACH.md
```

