# Deploy IR — guia para quem não programa

Você **não vai criar código** no Cloudflare nem na Vercel. Nesses sites a gente só aponta um nome
(`ir.meuanalistacrm.app`) para a máquina certa. O código da IR já existe neste computador, na pasta
`IR-CONSULTORIA`. A VPS só recebe uma cópia.

Faça **um bloco por vez**. Depois do Bloco A, volte no chat e cole o que viu na tela.

---

## O mapa (três casas)

Imagine três casas. A Lis já mora em duas delas. A IR vai morar na terceira, com um
**endereço novo**, sem mudar a fechadura da Lis.

| Casa | O que é | Lis hoje | IR |
|------|---------|----------|-----|
| **Cloudflare** | Placa de rua + túnel **local** `lis-agent` | `lis` → Vercel; `vec` → arquivo na VPS | Hostname `ir` entra no **mesmo arquivo** do túnel (porta 3010). **Não** migrar o túnel no dashboard |
| **Vercel** | Hospeda o **painel visual** da Lis | `lis.meuanalistacrm.app` | **Não criar projeto IR.** O painel da IR sai no mesmo `ir.meuanalistacrm.app` da API |
| **VPS** | Hostinger `srv1513539` | PM2 `conversa-hub-api` **:9000**; túnel PM2 `cloudflare-tunnel` (não systemd); `google-ads-mcp` **:3100**; Docker Evolution **:8080** | PM2 **novo** `ir-consultoria-api` **:3010**. Nunca restart dos ids 5, 8 e 9 |

Hoje, se você abre `https://ir.meuanalistacrm.app` no navegador, aparece 404 da Vercel.
Isso é normal: existe um registro “pega-tudo” (`*`) que manda qualquer nome não listado
para a Vercel. A IR ainda não tem placa própria.

---

## O que você NÃO vai mexer

- Projeto da Lis na Vercel (domínio `lis.meuanalistacrm.app`)
- Registros DNS `lis`, `vec`, `@` (apex) e `*` (wildcard)
- SSL/TLS global do Cloudflare (modo Full / Full strict)
- Cloudflare Access, WAF, Workers
- Botão **Start migration** do túnel `lis-agent` (irreversível; pode quebrar a Lis)
- `pm2 kill` na VPS (em 2026-08-19 derrubou a Lis; restore foi `pm2 resurrect`)

Se a tela pedir para “adicionar domínio na Vercel” ou “criar projeto”, **cancele**.

---

# Bloco A — fora da VPS (faça hoje)

## A0. O que o print do DNS mostrou (2026-08-19)

A Lis **não** está publicada por um IP tipo `187.x.x.x`. A linha `vec` é tipo **Tunnel**,
conteúdo **`lis-agent`**, nuvem laranja. Por isso **não** se cria um registro A copiando `vec`.
Essa tela de DNS também **não** é o lugar de criar o `ir`: o próprio túnel cria a linha
quando a gente adiciona um hostname público.

Tradução da tabela (não mexer em nenhuma destas linhas):

| Nome | Tipo | Significado | Ação |
|------|------|-------------|------|
| `*` | A | Pega-tudo → Vercel (por isso `ir.` dá 404 hoje) | não mexer |
| `lis` | CNAME | Painel da Lis na Vercel | não mexer |
| `vec` | Tunnel `lis-agent` | API da Lis | não mexer |
| `googleads-mcp` | Tunnel `lis-agent` | outro serviço no mesmo túnel | não mexer |
| apex / `www` / `_vercel` / CAA | vários | site e certificados | não mexer |

**Não clique em “+ Adicionar registro” nesta tela.**

## A1. Túnel Zero Trust — o que o print mostrou (2026-08-19)

Tela **Migrate lis-agent**: *“cannot be managed from the Zero Trust dashboard as it is a locally configured tunnel.”*

Isso quer dizer: as regras (`vec` → porta 3001, `googleads-mcp` → outra porta) estão num
**arquivo na VPS**, não neste site. Por isso não existe aba Public Hostname para clicar.

**Não clique em Start migration.** É irreversível. A Lis hoje depende desse arquivo local.
Migrar no meio do caminho é o jeito mais fácil de derrubar o `vec`.

O Bloco A no Cloudflare **acaba aqui**. Não adicione registro DNS, não crie túnel novo
(o instalador do Cloudflare costuma **substituir** o túnel da Lis), não mexa na Vercel.

O hostname `ir` será uma linha a mais nesse arquivo, **depois** de backup, com a Lis no ar.
Isso é o Bloco B, no Terminal.

## A2. Conferir a Vercel (não criar projeto)

1. Abra [https://vercel.com/dashboard](https://vercel.com/dashboard).
2. Abra o projeto da Lis (nome parecido com `conversa-hub`).
3. Vá em **Settings** → **Domains**.
4. Confirme a lista: deve ter `lis.meuanalistacrm.app` (e talvez `conversa-hub.vercel.app`).
5. **Não** clique em Add. **Não** adicione `ir.meuanalistacrm.app`.
6. Feche a Vercel.

O 404 atual do `ir.` vem do wildcard (`*`) no Cloudflare, não de um projeto IR na Vercel.
Criar um projeto novo lá **não** resolve e ainda bagunça o nome.

**Pare aqui no Cloudflare.** Clique em **← Back to tunnels** e feche o Zero Trust.
Não Start migration. Não Adicionar registro.

Próximo: Terminal no Mac, só para **ler** o arquivo do túnel na VPS (nada é alterado).

---

# Bloco B — VPS (só depois do A, juntos)

Auditoria da VPS (2026-08-19): Lis `{"status":"ok"}` em `:9000` e em `vec`. Túnel = PM2 `cloudflare-tunnel`. IR **online** em `:3010` (`ir-consultoria-api`, id 3).

Ordem:

1. Copiar pasta IR para `/opt/ir-consultoria` (rsync do Mac). Nunca `/opt/conversa-hub`.
2. `.env` da IR (`IR_APP_ENV=production`, porta 3010).
3. `npm install` + `pm2 start` **só** `ir-consultoria-api`.
4. Conferir `:3010` e de novo `:9000` / `vec`.
5. Backup do `config.yml` do túnel + uma linha `ir` → `localhost:3010` **antes** do 404.
6. CNAME no Cloudflare `ir` → `<tunnel-id>.cfargotunnel.com` (nuvem laranja), sem A record.
7. `pm2 restart cloudflare-tunnel` — único momento com alguns segundos sem `vec`. Só depois da IR responder em 3010.

Nunca: `pm2 restart all`, restart/delete de `conversa-hub-api` (id 9), `cloudflare-tunnel` (id 8) antes da hora, `google-ads-mcp` (id 5), `docker` da Evolution, Start migration.

Cada comando virá com: o que faz, onde colar, o que deve aparecer, e o que fazer se der errado.

---

# Bloco C — Meta (depois da IR responder em `https://ir.../api/health`)

Só então mudamos o webhook do **app da IR** (não o da Lis) para:

`https://ir.meuanalistacrm.app/api/ir/webhooks/whatsapp`

Fazer isso agora falha no “Verify and save”, porque o endereço ainda não atende.

---

## Mini-dicionário

| Palavra | Significado aqui |
|---------|------------------|
| DNS / registro | Linha na tabela do Cloudflare: nome → destino |
| A record | “Este nome é este IP” |
| CNAME | “Este nome é apelido de outro nome” (`lis` usa isso para a Vercel) |
| Proxy laranja | O Cloudflare fica na frente (HTTPS). Igual o `vec` |
| VPS | O computador Linux alugado onde a Lis já roda |
| SSH | Entrar nesse computador pelo Terminal |
| PM2 | Lista de programas que o servidor mantém ligados. A Lis é `conversa-hub-api`. O túnel é `cloudflare-tunnel`. A IR será `ir-consultoria-api` |
| Túnel | `cloudflared` no PM2; systemd `inactive` é normal nesta máquina |
| `.env` | Arquivo de senhas. Nunca vai para o GitHub |
