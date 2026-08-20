# Meta Outreach ativo — pós-formulário

## Princípio

Lead converte no formulário → sistema **inicia** conversa via **template aprovado** (custo Meta aceito pelo negócio).

## Pré-requisitos

1. Opt-in explícito no formulário (texto legal ok).
2. Template aprovado na WABA da IR (`pt_BR`).
3. Telefone normalizado E.164 (`5581…`).
4. Deduplicação por `meta_leadgen_id` / telefone recente.
5. Token System User (preferencial).

## Sequência + drip (confiança)

```text
lead_received
  → template #1 boas-vindas
  → awaiting_first_reply
  → (inbound) janela 24h → orquestrador IR
  → (sem inbound) drip templates #2 / #3 (ver TRUST_AND_DRIP.md)
  → histórico importado → reheat com aprovação humana
```

## Templates (família — aprovar na Meta)

### #1 Boas-vindas — `contato_inicial`

Nome no env: `IR_WHATSAPP_TEMPLATE_INITIAL=contato_inicial` (`pt_BR`).
Variável `{{1}}` = nome do lead. Público: **médicos**.

```text
Olá, {{1}}! Aqui é da IR Consultoria, assessoria especializada em Restituição
de contribuições ao INSS para médicos.

Recebemos o seu cadastro para verificar se existem valores de INSS que possam
ser restituídos.

Já recuperamos mais de R$ 25 milhões em valores para clientes.

Posso fazer algumas perguntas rápidas e orientar você sobre a análise inicial gratuita?

Para sua segurança, nunca solicitamos senha do gov.br.
```

Botões de resposta rápida: **Sim** / **Não tenho mais interesse**.

O clique chega no webhook como `type: "button"` com o texto em `button.text` — o
orquestrador trata “Sim” como aceite e pede uma **abertura explicativa curta**
(teto / sem garantia; o modelo varia o texto, com fallback curto). “Não tenho mais interesse”
é opt-out.

### #2 Confiança — criar na Meta como `ir_confianca` (pt_BR, UTILITY)

Corpo (1 variável {{1}} = primeiro nome):

```text
{{1}}, aqui é a IR Consultoria. Não pedimos senha do gov.br, PIX nem taxa para “liberar” nada.
Se ainda quiser, responda esta mensagem que eu te oriento sobre a análise de indício de restituição do INSS (sem garantia de valor).
```

Botões: Quero continuar / Não tenho interesse

Env: `IR_WHATSAPP_TEMPLATE_TRUST=ir_confianca`

### #3 Explica INSS — criar na Meta como `ir_explica_inss` (pt_BR, UTILITY)

```text
{{1}}, muita gente confunde com restituição de Imposto de Renda. Aqui o foco é contribuição ao INSS.
A decisão final é humana. Se preferir, responda “quero entender” ou “parar”.
```

Botões: Quero entender / Parar

Env: `IR_WHATSAPP_TEMPLATE_EXPLAIN=ir_explica_inss`

## Como criar na Meta (clique a clique)

1. Abra [business.facebook.com](https://business.facebook.com) com a conta da **IR** (não a da V&C/Lis).
2. **WhatsApp Manager** → a WABA da IR → **Modelos de mensagem** → **Criar modelo**.
3. Categoria **Utilidade**. Idioma **Português (BR)**.
4. Nome exatamente `ir_confianca` (depois outro modelo `ir_explica_inss`).
5. Cole o corpo acima. Variável `{{1}}` = primeiro nome.
6. Botões de resposta rápida com os textos indicados.
7. Envie para análise. Só teste o botão do painel **depois** de **Aprovado**.
8. Na VPS, no arquivo `/opt/ir-consultoria/.env` (não copie o da Lis), acrescente:

```env
IR_WHATSAPP_TEMPLATE_TRUST=ir_confianca
IR_WHATSAPP_TEMPLATE_EXPLAIN=ir_explica_inss
IR_DRIP_STEP2_HOURS=24
IR_DRIP_STEP3_HOURS=120
IR_FOLLOW_UP_WORKER_ENABLED=true
```

9. Reinicie **somente** `pm2 restart ir-consultoria-api --update-env`.

O worker automático só dispara se o lead **não** respondeu. Para testar na hora, use o painel → Configuração → **Testar follow-up 24h**.

### Reativação (histórico — só com aprovação)

```text
{{1}}, aqui é a IR Consultoria. Vimos nosso contato anterior sobre restituição INSS.
Podemos retomar de onde paramos, no seu ritmo?
```

## Erros

| Situação | Ação |
|----------|------|
| 132001 / template inválido | `outreach_failed` + alerta ops |
| Rate limit / 5xx | Retry com backoff |
| Número inválido | `lost` / correção manual |
| Sem opt-in | **Não** disparar |

## Relação com a Lis

Lis raramente inicia fora da janela (exceto lembretes de reunião). IR **depende** do disparo ativo como porta de entrada.
