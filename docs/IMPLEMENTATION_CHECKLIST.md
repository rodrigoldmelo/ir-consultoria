# IR Consultoria — Checklist de Implementacao

## Fase 0 — Informacoes obrigatorias

- Definir servico exato e promessa comercial permitida (Restituicao INSS).
- Definir criterios de elegibilidade preliminar.
- Definir criterios de inelegibilidade.
- Definir perguntas de qualificacao.
- Definir documentos obrigatorios.
- Definir documentos opcionais.
- Definir responsavel interno pelos calculos.
- Obter acesso Advbox/API/documentacao.
- Obter WABA, app Meta, phone number id e token permanente.
- Aprovar templates WhatsApp.
- Confirmar opt-in no formulario Meta.

## Fase 1 — Base tecnica separada

- Scaffold em `/Users/rodrigolemos/Documents/IR-CONSULTORIA` (este repo).
- Criar schema proprio `ir_*`.
- Criar storage/bucket para documentos IR.
- Criar camada de configuracao propria.
- Criar logs e audit events.
- Criar painel minimo para visualizar leads/casos.

## Fase 2 — Meta Lead Ads

- Configurar webhook Lead Ads.
- Validar assinatura/verificacao da Meta.
- Receber payload de teste.
- Buscar detalhes do lead pelo Graph API se o webhook enviar apenas `leadgen_id`.
- Deduplicar leads.
- Normalizar telefone.
- Criar lead.
- Enfileirar template inicial.

## Fase 3 — WhatsApp templates

- Criar templates na WABA.
- Testar envio ativo para numero interno.
- Persistir `external_message_id`.
- Tratar erros 400/401/403/rate limit.
- Criar fallback para `outreach_failed`.

## Fase 4 — Atendimento autonomo

- Criar prompt especifico IR.
- Criar regras deterministicas antes do modelo:
  - opt-out;
  - pedido de humano;
  - documentos recebidos;
  - respostas curtas;
  - dados sensiveis;
  - contradicoes.
- Criar extrator estruturado de qualificacao.
- Criar motor de proximo passo.
- Criar status `needs_human_review`.
- **Sem** meeting-scheduler / Calendar.

## Fase 5 — Documentos

- Baixar midias da Meta.
- Salvar arquivo em storage.
- Gerar hash e metadados.
- Classificar documento.
- Atualizar checklist do caso.
- Pedir documentos faltantes.
- Validar tamanho/formato.

## Fase 6 — Advbox

- Criar cliente no Advbox.
- Evitar duplicidade por CPF/e-mail/telefone.
- Criar caso/atendimento/pasta.
- Anexar documentos.
- Criar tarefa para responsavel.
- Registrar ids retornados.
- Implementar fila de retentativa.
- Implementar tela de falhas de sincronizacao.

## Fase 7 — Operacao e qualidade

- Dashboard por status.
- Busca por telefone/nome.
- Visualizacao de documentos.
- Assumir atendimento / reenviar template.
- Metricas: leads, templates, respostas, docs, Advbox.
- Teste E2E com numero interno.

## Ordem recomendada

1. Fechar Fase 0 (negocio).
2. Meta/WABA/template.
3. Schema + storage.
4. Ingestion Lead Ads + template.
5. WhatsApp + conversa.
6. Documentos.
7. Advbox.
8. Piloto interno.

## Guardrails

- Agente faz triagem preliminar, nao decisao final.
- Linguagem: "indicio" / "segue para analise".
- Sem secrets no git.
- Isolado da Lis.
