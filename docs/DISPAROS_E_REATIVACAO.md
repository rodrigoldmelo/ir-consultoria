# Disparos e Reativação — IR Consultoria

## Objetivo

Organizar duas operações diferentes sem misturar com o funil automático de Lead Ads:

1. **Leads frios de formulário/lista**: contatos que podem receber o template inicial aprovado `contato_inicial`.
2. **Base antiga com conversas**: contatos que já tiveram contexto, objeções, documentos ou tentativa comercial e precisam de reativação segmentada.

## Já implementado

- Aba **Leads**: botão **Enviar contato** enfileira `contato_inicial` para um lead específico.
- Detalhe de **Conversas**: botão **Enviar primeiro contato** aparece na lateral e usa a mesma fila do worker para conversas sem histórico.
- Se a conversa não tiver `lead_id`, o backend tenta achar lead por telefone. Se não encontrar, cria um lead operacional `panel_manual` para manter auditoria e evitar envio solto sem registro.

## Próximo módulo: Disparos

Criar uma janela própria **Disparos** para listas novas de médicos:

- Upload CSV com nome, telefone, email e médico(a).
- Validação de telefone, duplicados, opt-out, já enviado e conversa existente.
- Resumo antes de disparar: total importado, válidos, bloqueados, duplicados e estimativa de custo por template.
- Modo manual: operador seleciona destinatários e envia.
- Modo automático: cria lote aprovado e o worker dispara em ritmo controlado.
- Métricas por lote: enfileirados, enviados, falhas, respostas, opt-out e avanço para CNIS.

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
