# Deploy IR Consultoria — Meta + VPS (junto com a Lis)

**Atualizado:** 2026-08-11
**Princípio:** mesma VPS e mesma família de domínio (`meuanalistacrm.app`); **processo, secrets, WABA e código separados**. Lis permanece intacta.

---

## 1. Recomendação (o que fazer)

### Veredito

| Opção | Quando | Veredito |
|-------|--------|----------|
| Multi-tenant dentro do `conversa-hub` (como `REPLICAR_NICHOS`) | Outro nicho **receptivo** com agenda | **Não** para IR |
| Repo + PM2 + WABA isolados (este projeto) | Funil **ativo**, Advbox, sem Calendar | **Sim — seguir isto** |

A Lis e a IR compartilham **padrões** (webhook Meta, delays, painel, PM2), não o mesmo processo Node nem o mesmo `phone_number_id`.

### Por quê não meter a IR no Conversa Hub

- Funil diferente: Lis = receptiva + reunião; IR = template pós-formulário + documentos + Advbox.
- Risco de regressão em `meeting-scheduler` / Calendar / follow-ups da V&C.
- Secrets e tokens diferentes (WABA IR ≠ WABA V&C).
- Já existe repo isolado em `/Users/rodrigolemos/Documents/IR-CONSULTORIA`.

### Mapa alvo (Lis intacta)

Hoje (não alterar):

| Peça | Host / processo |
|------|-----------------|
| Painel Lis | `lis.meuanalistacrm.app` (Vercel) |
| API Lis | `vec.meuanalistacrm.app` → PM2 `conversa-hub-api` → **:3001** |
| Webhook WA Lis | `https://vec.meuanalistacrm.app/api/webhook/meta` |

IR (adicionar):

| Peça | Host / processo |
|------|-----------------|
| API IR | **`ir.meuanalistacrm.app`** → PM2 `ir-consultoria-api` → **:3010** |
| Webhook WA IR | `https://ir.meuanalistacrm.app/api/ir/webhooks/whatsapp` |
| Webhook Lead Ads | `https://ir.meuanalistacrm.app/api/ir/webhooks/meta-leads` |
| Painel IR | `https://ir.meuanalistacrm.app` (mesmo host da API; `npm run panel:build`) |

Alternativa (se quiser **um só hostname** na VPS): no nginx de `vec.meuanalistacrm.app`, só o prefixo `/api/ir/` vai para `:3010`; **todo o resto continua em `:3001`**. Subdomínio `ir.` é mais seguro (zero chance de misturar webhook da Lis).

### Isolamento obrigatório

- Repo: `/opt/ir-consultoria` (não clone dentro de `/opt/conversa-hub`)
- PM2: `ir-consultoria-api` (não reiniciar `conversa-hub-api` no deploy IR)
- Porta: **3010** (Lis fica em **3001**)
- Env: prefixo `IR_*` + arquivo `/opt/ir-consultoria/.env` (`chmod 600`)
- Supabase: projeto **novo** (preferível) ou schema `ir_*` em projeto separado da Lis
- Meta: **App + WABA + número + templates + verify token** próprios

---

## 2. Passo a passo Meta (API / WhatsApp / Lead Ads)

Faça na conta Business da **IR Consultoria** (não na da V&C), salvo se a BM for compartilhada com assets separados.

### 2.1 Meta Business Suite / Business Manager

1. Abrir [business.facebook.com](https://business.facebook.com/).
2. Confirmar Business Manager da IR (ou criar).
3. Verificar negócio (CNPJ/docs) se ainda não estiver verificado — acelera templates e limites.
4. Em **Configurações da empresa → Contas → Contas do WhatsApp**: criar / reivindicar **WABA** da IR.
5. Adicionar o **número** novo (chip ou número virtual Meta). Completar verificação por SMS/voz.
6. Em **Usuários do sistema**: criar System User (ex.: `ir-whatsapp-prod`) com permissões na WABA + app. Gerar token **permanente** (nunca commitar).

### 2.2 App no Meta for Developers

1. [developers.facebook.com](https://developers.facebook.com/) → **Meus apps → Criar app**.
2. Tipo: **Business**.
3. Nome: `IR Consultoria WhatsApp` (ou similar).
4. Associar ao Business Manager da IR.
5. Adicionar produtos:
   - **WhatsApp** → Cloud API
   - **Webhooks**
   - (Lead Ads) **Marketing API** / Lead Access conforme o fluxo do formulário

### 2.3 WhatsApp Cloud API no app

1. Produto WhatsApp → **API Setup**.
2. Anotar:
   - `IR_META_WABA_ID`
   - `IR_META_PHONE_NUMBER_ID` (**diferente** do da Lis)
   - Número de exibição
3. Colar token do System User em `IR_META_WHATSAPP_TOKEN`.
4. Em **Configuration → Webhook**:
   - **Callback URL:** `https://ir.meuanalistacrm.app/api/ir/webhooks/whatsapp`
   - **Verify token:** valor forte → `IR_META_VERIFY_TOKEN` (diferente do da Lis)
5. Inscrever o campo **`messages`** (e statuses se quiser delivery).
6. Testar “Verify and save” **depois** da API IR estar no ar com GET de verificação.

### 2.4 Template inicial (outreach ativo)

1. WhatsApp Manager → **Message templates** → criar (idioma `pt_BR`).
2. Categoria tipicamente **Utility** ou **Marketing** (Meta classifica; marketing tem custo/opt-in mais rígido).
3. Corpo sugerido (ajustar juridicamente):

```text
Olá, {{1}}. Aqui é da IR Consultoria.
Recebemos seu cadastro para análise de possível restituição junto ao INSS.
Posso fazer algumas perguntas rápidas e te orientar sobre os documentos necessários?
```

4. Aguardar aprovação.
5. Guardar o **nome exato** do template em `IR_WHATSAPP_TEMPLATE_INITIAL`.
6. Confirmar opt-in no formulário Meta/landing (texto legal + checkbox). Sem opt-in → **não** disparar.

### 2.5 Lead Ads (formulário → disparo)

1. Página Facebook/Instagram da IR conectada à BM.
2. Criar formulário Lead Ads (ou Instant Form) com: nome, telefone, e-mail, **opt-in WhatsApp**.
3. No app Meta:
   - Webhook de **Page** / leadgen **ou**
   - Callback Lead: `https://ir.meuanalistacrm.app/api/ir/webhooks/meta-leads`
4. Verify token: pode ser o **mesmo** `IR_META_VERIFY_TOKEN` (ou outro dedicado — documente no `.env`).
5. Assinar `leadgen` na Page correta.
6. Anotar `IR_META_APP_ID`, `IR_META_APP_SECRET`, `IR_META_PAGE_ID`, `IR_META_FORM_IDS`.
7. Se o webhook só mandar `leadgen_id`, a API busca o lead na Graph API com o token (já previsto no checklist).

### 2.6 Checklist Meta antes de produção

- [ ] Número IR ≠ número Lis
- [ ] Token System User IR ≠ token Lis
- [ ] Verify token IR ≠ verify token Lis
- [ ] Callback WA aponta para **ir.** (não para `vec.../api/webhook/meta`)
- [ ] Template aprovado + nome no `.env`
- [ ] Opt-in no formulário
- [ ] Teste com número interno: template chega → reply → webhook POST na IR

---

## 3. Passo a passo VPS (Lis intacta)

Valores atuais conhecidos: Lis em `/opt/conversa-hub`, PM2 `conversa-hub-api`, porta **3001**, API pública `vec.meuanalistacrm.app`.

### 3.-1 Estado real do DNS (verificado em 2026-08-18)

| Fato | Consequência |
|------|--------------|
| `*.meuanalistacrm.app` é **wildcard** no Cloudflare (qualquer subdomínio resolve) | `ir.` já resolve hoje, mas **não** aponta para a VPS |
| `ir.meuanalistacrm.app` responde `404` com `x-vercel-error: DEPLOYMENT_NOT_FOUND` | O wildcard cai na Vercel; o subdomínio está pendurado, sem deploy |
| Apex `meuanalistacrm.app` → IPs da Vercel | Não mexer no apex |
| `vec` e `lis` respondem via `server: cloudflare` | Proxy laranja ligado; TLS termina no Cloudflare |
| `https://vec.../api/health` → `200` + `x-powered-by: Express` | Baseline da Lis; repetir esse teste no fim |

Portanto **não** basta "criar o registro `ir`": é preciso um registro **explícito** `ir` → IP da VPS, que passa a ter prioridade sobre o wildcard. Antes disso, confirme com o dono do domínio que nada deveria estar servindo `ir.` na Vercel (ex.: site institucional futuro). Se houver dúvida, use `ir-api` e deixe `ir` livre para o site.

### 3.0 Auditoria antes de qualquer mudança (somente leitura)

Da máquina local, sem copiar arquivo para o servidor:

```bash
ssh root@IP_DA_VPS 'bash -s' < scripts/vps-audit.sh
```

O script não instala, não edita e não reinicia nada. Ele responde:

- Lis está **online** no PM2 e o health de `:3001` responde (baseline).
- Porta **3010 está livre**.
- Sobra memória para um segundo processo Node (`free -m`).
- Versão do Node (precisa **>= 20**).
- Quais `server_name` e `ssl_certificate` já existem no nginx — é isso que define se o TLS da IR sai por **Let's Encrypt/certbot** ou por **certificado Origin do Cloudflare** (copiar o padrão do `vec`, não inventar outro).
- `nginx -t` já passa **antes** de mexermos (se falhar aqui, pare: o problema é anterior à IR).
- Estado do `ufw`.

Registro conhecido: a auditoria da Lis (2026-06-16) usou `187.77.232.209` e o SSH na porta 22 deu **timeout**. Confirme host/porta/chave de acesso antes de contar com esse IP.

### 3.1 DNS (Cloudflare)

| Tipo | Nome | Alvo | Proxy |
|------|------|------|-------|
| A | `ir` (ou `ir-api`) | IP da VPS | igual ao de `vec` |

Não altere `lis`, `vec`, o apex nem o wildcard. Depois de criar, confirme que saiu da Vercel:

```bash
dig +short ir.meuanalistacrm.app
curl -sSI https://ir.meuanalistacrm.app/ | grep -i -E 'server|vercel'
```

Enquanto aparecer `x-vercel-error`, o registro explícito ainda não propagou.

### 3.2 Código na VPS

Não existe remote git ainda, então o caminho é rsync com destino protegido:

```bash
# 1) simular (nada é escrito)
IR_VPS_HOST=root@IP_DA_VPS IR_VPS_DRY_RUN=1 npm run sync:vps

# 2) revisar a lista e enviar
IR_VPS_HOST=root@IP_DA_VPS npm run sync:vps
```

O script recusa qualquer destino que não termine em `/ir-consultoria` — sem essa guarda, um `IR_VPS_DEST` errado com `--delete` apagaria a Lis. `.env*` fica fora do sync (e, por estar excluído, o `.env` do servidor **não** é apagado).

```bash
cd /opt/ir-consultoria
npm install     # tsx é dependência de runtime; `--omit=dev` também funciona
```

### 3.3 `.env` só da IR

```bash
cd /opt/ir-consultoria
cp .env.example .env
chmod 600 .env
nano .env   # preencher IR_* — nunca copiar .env da Lis
```

Mínimo para subir (com `IR_APP_ENV=production` o boot **falha rápido** se faltar algo):

```env
IR_APP_ENV=production
PORT=3010
IR_PANEL_TOKEN=<token forte diferente do PANEL_API_TOKEN da Lis>
IR_PANEL_LOGIN_USER=admin
IR_PANEL_LOGIN_PASSWORD=<senha do painel; se vazio, a senha é o IR_PANEL_TOKEN>
IR_PANEL_SESSION_SECRET=<32+ caracteres, diferente da Lis>
IR_META_VERIFY_TOKEN=<verify da seção Meta>
IR_META_APP_SECRET=<obrigatório: valida a assinatura dos webhooks>
IR_META_WHATSAPP_TOKEN=
IR_META_PHONE_NUMBER_ID=
IR_WHATSAPP_TEMPLATE_INITIAL=
IR_WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
IR_SUPABASE_URL=
IR_SUPABASE_SERVICE_ROLE_KEY=
IR_OPENAI_API_KEY=
IR_TEMPLATE_WORKER_ENABLED=true
```

Em produção a API escuta só `127.0.0.1:3010` (`IR_BIND_ADDRESS` para mudar), então a porta não fica exposta pelo IP mesmo sem firewall.

### 3.4 PM2 — segundo processo

Confirme que a **Lis está online antes** do `pm2 save`: o save persiste o estado atual, e salvar com a Lis parada faria o boot subir só a IR.

```bash
pm2 list                      # conversa-hub-api deve estar online
cd /opt/ir-consultoria
pm2 start ecosystem.config.cjs
pm2 list                      # agora os dois online
pm2 save
```

O `ecosystem.config.cjs` declara só `ir-consultoria-api`, em `fork` com 1 instância (cluster duplicaria os workers de template/drip) e chamando `tsx` direto (o npm intermediário às vezes sobrevive ao restart e deixa duas instâncias na mesma porta).

```bash
curl -sS http://127.0.0.1:3010/api/health   # {"ok":true,"service":"ir-consultoria",...}
curl -sS http://127.0.0.1:3001/api/health   # Lis continua
```

Deploy futuro IR (não mexe na Lis):

```bash
IR_VPS_HOST=root@IP_DA_VPS npm run sync:vps
ssh root@IP_DA_VPS 'cd /opt/ir-consultoria && npm install && pm2 restart ir-consultoria-api --update-env && pm2 save'
```

### 3.5 Nginx — site novo (recomendado)

Criar `/etc/nginx/sites-available/ir.meuanalistacrm.app`. Ajuste a parte de TLS para **o mesmo padrão que o `vec` usa** (descoberto em 3.0):

```nginx
server {
    listen 80;
    server_name ir.meuanalistacrm.app;

    # Import de CSV no painel chega a 5 MB; o default do nginx (1m) devolveria 413.
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
nginx -t                                     # deve passar ANTES do symlink
ln -s /etc/nginx/sites-available/ir.meuanalistacrm.app /etc/nginx/sites-enabled/
nginx -t                                     # se falhar: remova o symlink e NÃO recarregue
systemctl reload nginx                       # reload, não restart (não derruba a Lis)
```

TLS, conforme o que o `vec` já faz:

- **Let's Encrypt/certbot:** `certbot --nginx -d ir.meuanalistacrm.app`. Com o proxy do Cloudflare ligado, o desafio HTTP-01 precisa chegar à origem — desligue o proxy (nuvem cinza) durante a emissão e religue depois, ou use DNS-01.
- **Certificado Origin do Cloudflare:** reaproveite o mesmo par de arquivos do `vec` (cobre `*.meuanalistacrm.app`) e só adicione o bloco `listen 443 ssl`.

**Não edite** o `location /` do site da Lis/`vec` para apontar para 3010.

#### Alternativa: prefixo no mesmo `vec`

Só se quiser um hostname:

```nginx
# Dentro do server { } de vec.meuanalistacrm.app — ANTES do location genérico /api
location /api/ir/ {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Nesse caso callbacks Meta:

- WA: `https://vec.meuanalistacrm.app/api/ir/webhooks/whatsapp`
- Leads: `https://vec.meuanalistacrm.app/api/ir/webhooks/meta-leads`

Health da IR nesse arranjo: `https://vec.../api/ir/health` (alias existe no código). `https://vec.../api/health` **continua sendo da Lis**.

### 3.6 Firewall

A API escuta apenas o loopback em produção, então nem é preciso abrir 3010 — e se alguém abrir por engano, não há o que atender no IP público. Mantenha o padrão que a Lis já usa; não altere regras existentes.

### 3.7 Ligar webhooks Meta

1. IR no ar pelo domínio: `curl -sS https://ir.meuanalistacrm.app/api/health`.
2. Conferir a assinatura pela URL pública, antes de ligar na Meta:
   ```bash
   IR_WEBHOOK_BASE_URL=https://ir.meuanalistacrm.app npm run check:webhook
   ```
   Em produção o esperado é **403 sem assinatura**, 403 com assinatura errada e 200 com a válida.
   O `IR_META_APP_SECRET` local tem de ser o mesmo do servidor para esse teste valer.
3. No app Meta → Webhook → Verify (GET) → assinar `messages` e `leadgen`.
4. Mensagem de teste / lead de teste.
5. Logs: `pm2 logs ir-consultoria-api --lines 100`.

Cloudflare no meio: os webhooks da Meta para a Lis já passam por esse mesmo proxy em `vec`, então o caminho é comprovado. Se algum POST da Meta for barrado, o suspeito é regra de WAF/Bot Fight — libere o path `/api/ir/webhooks/*` em vez de desligar o proxy.

### 3.8 Rollback (se algo der errado)

```bash
pm2 stop ir-consultoria-api        # a Lis não depende desse processo
rm /etc/nginx/sites-enabled/ir.meuanalistacrm.app
nginx -t && systemctl reload nginx

# Confirmar Lis:
curl -sS http://127.0.0.1:3001/api/health
curl -sS https://vec.meuanalistacrm.app/api/health
pm2 describe conversa-hub-api | grep -E 'status|uptime'
```

Se quiser desfazer também o boot automático: `pm2 delete ir-consultoria-api && pm2 save` (com a Lis online no momento do save).

No DNS, o rollback é apagar o registro explícito `ir` — o subdomínio volta a cair no wildcard.

---

## 4. Ordem de execução sugerida

1. Fechar Fase 0 negócio (critérios, docs, texto template, opt-in).
2. Criar App + WABA + número + System User (Meta).
3. Subir código + PM2 `:3010` + DNS/`ir.` + nginx (VPS).
4. Verificar webhook WA.
5. Aprovar template → testar disparo interno.
6. Webhook Lead Ads + formulário.
7. Supabase `ir_*` + ligar ingestion de verdade.
8. Painel `ir-panel.` (depois).
9. Advbox.

---

## 5. O que NUNCA fazer

- Reiniciar/alterar `.env` da Lis para “caber” a IR.
- Reusar `META_PHONE_NUMBER_ID` / token / templates da V&C.
- Apontar o webhook da Lis para a IR (ou o contrário).
- Rodar IR na porta 3001.
- Misturar prompts / Calendar / meeting-scheduler.
- Commitar `.env` ou tokens.
- `rsync --delete` para qualquer destino fora de `/opt/ir-consultoria` (o script recusa).
- `pm2 save` com a Lis parada (grava o estado errado para o próximo boot).
- `systemctl restart nginx` quando `reload` resolve.
- `pm2 delete all`, `pm2 kill`, `pm2 update` — derrubam a Lis junto.

---

## 6. Smoke pós-deploy

```bash
# Lis intacta (mesmos comandos da auditoria inicial)
curl -sS https://vec.meuanalistacrm.app/api/health
curl -sS http://127.0.0.1:3001/api/health
pm2 describe conversa-hub-api | grep -E 'status|uptime|restarts'

# IR
curl -sS https://ir.meuanalistacrm.app/api/health
pm2 describe ir-consultoria-api | grep -E 'status|uptime|restarts'

# Assinatura pela URL pública
IR_WEBHOOK_BASE_URL=https://ir.meuanalistacrm.app npm run check:webhook
```

Critério de aceite: `restarts` da Lis **não** aumentou, health da Lis igual ao baseline, IR responde pelo domínio e webhook sem assinatura devolve 403.

Painel Lis (`lis.meuanalistacrm.app`) e webhook antigo da Meta **inalterados**.
