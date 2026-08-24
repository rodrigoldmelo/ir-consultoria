# Disparos e Reativação — IR Consultoria

## Objetivo

Organizar duas operações diferentes sem misturar com o funil automático de Lead Ads:

1. **Leads frios de formulário/lista**: contatos que podem receber o template inicial aprovado `contato_inicial`.
2. **Base antiga com conversas**: contatos que já tiveram contexto, objeções, documentos ou tentativa comercial e precisam de reativação segmentada.

## Já implementado

- Aba **Leads**: botão **Enviar contato** enfileira `contato_inicial` para um lead específico.
- Detalhe de **Conversas**: botão **Enviar primeiro contato** aparece na lateral e usa a mesma fila do worker para conversas sem histórico.
- Se a conversa não tiver `lead_id`, o backend tenta achar lead por telefone. Se não encontrar, cria um lead operacional `panel_manual` para manter auditoria e evitar envio solto sem registro.

## Disparos

Primeira versão implementada na aba **Disparos** para listas novas de médicos:

- Upload CSV com nome, telefone, email e médico(a).
- Validação local de telefone e duplicados.
- Custo por template editável na tela e estimativa antes de disparar.
- Botão **Disparar elegíveis** chama `POST /api/ir/panel/outreach/batch`.
- Backend revalida opt-out por telefone na tabela global `ir_opt_out_numbers`, duplicados e templates já enviados/enfileirados.
- Backend cria/reaproveita leads `panel_batch` e usa a fila existente do worker para `contato_inicial`.

## Opt-out global

Quando alguém responde **Não tenho interesse**, **Não tenho mais interesse**, **parar**, **remover**, **descadastrar** ou variações, o telefone é salvo em `ir_opt_out_numbers`. A partir daí:

- Lead Ads com o mesmo telefone são ignorados antes de enfileirar template.
- Disparos em massa pulam o número automaticamente.
- Botões manuais de primeiro contato não enfileiram template para esse telefone.
- O worker faz uma checagem final antes de chamar a Meta, protegendo leads que já estavam em fila.
- Se a pessoa chamar organicamente depois, a entrada ainda é aceita e a conversa pode seguir; a supressão continua valendo para novos disparos ativos.

Próximos upgrades:

- Persistir lotes em `ir_outreach_batches` e destinatários em `ir_outreach_recipients`.
- Modo manual por seleção individual.
- Métricas persistidas por lote: enfileirados, enviados, falhas, respostas, opt-out e avanço para CNIS.

## Base antiga

Não usar `contato_inicial` cegamente quando já existe histórico. O caminho recomendado:

- Importar o backup na aba **Importar histórico**.
- Rodar **Reaquecer** para classificar conversas.
- Segmentar por contexto:
  - pediu CNIS e não enviou;
  - tinha indício e não fechou;
  - não tinha direito na época;
  - objeção de confiança;
  - objeção de preço;
  - opt-out ou risco, que deve ser bloqueado.
- Usar templates próprios aprovados na Meta, por exemplo `reativacao_cnis`, `retomada_analise_inss` e `reativacao_inss_medicos`.

## Observação de custo

O custo do template deve ser configurável no backend ou buscado de fonte oficial atualizada antes de ativar disparos em massa. Não fixar preço em código.
