# Meta — passo a passo (IR Consultoria)

**Objetivo:** WABA + número + template + webhooks apontando para a IR (não usar credenciais da Lis).

**Status Supabase:** ✅ mesmo projeto da Lis, tabelas `ir_*`, bucket `ir-documents`.

---

## Antes de começar

- Conta Business Manager da **IR Consultoria**
- Número WhatsApp **novo** (≠ V&C / Lis)
- Template com opt-in no formulário Lead Ads

Verifique o que falta no env:

```bash
npm run check:env
```

---

## Parte 1 — Business Manager + número (15–30 min)

### 1.1 WABA

1. [business.facebook.com](https://business.facebook.com/) → **Configurações da empresa**
2. **Contas → Contas do WhatsApp** → **Adicionar**
3. Crie ou vincule a WABA da IR
4. **Adicionar número** → verificação SMS/voz

### 1.2 System User + token permanente

1. **Usuários do sistema** → **Adicionar**
2. Nome: `ir-whatsapp-prod`
3. Permissões: WABA da IR + App (criado na Parte 2)
4. **Gerar token** → marque `whatsapp_business_messaging`, `whatsapp_business_management`
5. Copie o token → `.env.local`:

```env
IR_META_WHATSAPP_TOKEN=EAAxxxx...
```

---

## Parte 2 — App Meta for Developers (10 min)

1. [developers.facebook.com](https://developers.facebook.com/) → **Criar app** → tipo **Business**
2. Nome: `IR Consultoria WhatsApp`
3. Vincule ao Business Manager da IR
4. Adicione produto **WhatsApp**

### Anote no `.env.local`

| Onde no painel | Variável |
|----------------|----------|
| Configurações → Básico → ID do app | `IR_META_APP_ID` |
| Configurações → Básico → Chave secreta | `IR_META_APP_SECRET` |
| WhatsApp → API Setup → Phone number ID | `IR_META_PHONE_NUMBER_ID` |
| WhatsApp → API Setup → WhatsApp Business Account ID | `IR_META_WABA_ID` |

---

## Parte 3 — Verify token (2 min)

Invente uma string forte (diferente da Lis):

```env
IR_META_VERIFY_TOKEN=ir_verify_xxxxxxxxxxxxxxxx
```

Usada nos webhooks WhatsApp e Lead Ads.

---

## Parte 4 — Template WhatsApp (aguardar aprovação Meta)

1. [WhatsApp Manager → Modelos de mensagem](https://business.facebook.com/wa/manage/message-templates/)
2. **Criar modelo** → idioma **Português (BR)**
3. Categoria: Utility ou Marketing (Meta decide na revisão)
4. Corpo (exemplo com 1 variável):

```text
Olá, {{1}}. Aqui é da IR Consultoria.
Recebemos seu cadastro para análise de possível restituição junto ao INSS.
Posso fazer algumas perguntas rápidas e te orientar sobre os documentos necessários?
```

5. Após **aprovado**, copie o **nome exato** (ex.: `ir_boas_vindas`):

```env
IR_WHATSAPP_TEMPLATE_INITIAL=ir_boas_vindas
IR_WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
```

---

## Parte 5 — Webhooks

### Opção A — Produção (VPS já no ar)

| Webhook | URL |
|---------|-----|
| WhatsApp | `https://ir.meuanalistacrm.app/api/ir/webhooks/whatsapp` |
| Lead Ads | `https://ir.meuanalistacrm.app/api/ir/webhooks/meta-leads` |

### Opção B — Teste local com ngrok (antes da VPS)

```bash
# Terminal 1
npm run api:dev

# Terminal 2
ngrok http 3010
```

Use a URL ngrok:

- `https://XXXX.ngrok-free.app/api/ir/webhooks/whatsapp`
- `https://XXXX.ngrok-free.app/api/ir/webhooks/meta-leads`

### Configurar no app Meta

1. **WhatsApp → Configuration → Webhook**
   - Callback URL: (URL acima)
   - Verify token: `IR_META_VERIFY_TOKEN`
   - Inscrever: **messages**
2. **Webhooks → Page** (Lead Ads)
   - Assinar campo **leadgen**
   - Mesma URL `/api/ir/webhooks/meta-leads`

Teste verify: Meta faz GET — a API responde com o challenge se o token bater.

---

## Parte 6 — Lead Ads (formulário)

1. Crie formulário com: nome, telefone, e-mail, **checkbox opt-in WhatsApp**
2. Anote **Page ID** e **Form ID**:

```env
IR_META_PAGE_ID=123456789
IR_META_FORM_IDS=987654321
```

---

## Parte 7 — Validar localmente

```bash
npm run check:env    # tudo Meta ✅
npm run api:dev
npm run smoke
curl -s http://localhost:3010/api/health
# integrations.metaWhatsApp: true, metaGraph: true
```

Teste lead (simulado):

```bash
curl -X POST http://localhost:3010/api/ir/webhooks/meta-leads \
  -H "Content-Type: application/json" \
  -d '{"leadgen_id":"test_manual_1","phone":"5581SEUNUMERO","name":"Rodrigo","opt_in_whatsapp":true}'
```

Se Meta configurado: template chega no WhatsApp (não stub).

---

## Parte 8 — Depois: VPS

Quando Meta local OK → `docs/DEPLOY_VPS_E_META.md` seção 3 (PM2 `:3010`, DNS `ir.`, nginx).

Atualize callbacks Meta de ngrok para `https://ir.meuanalistacrm.app/...`.

---

## Checklist

```
[ ] IR_META_WHATSAPP_TOKEN
[ ] IR_META_PHONE_NUMBER_ID
[ ] IR_META_WABA_ID
[ ] IR_META_APP_ID + IR_META_APP_SECRET
[ ] IR_META_VERIFY_TOKEN
[ ] IR_WHATSAPP_TEMPLATE_INITIAL (aprovado)
[ ] Webhook WA verificado
[ ] Webhook leadgen verificado
[ ] Teste template no seu celular
[ ] VPS ir.meuanalistacrm.app
```
