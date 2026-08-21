# Checklist documental — Restituição INSS (rascunho)

> Validar com a operação IR antes de hardcodar no agente.
> Objetivo: reunir material para **análise humana** se há indício de direito à restituição.

## Obrigatoriedade (proposta inicial)

### Provavelmente obrigatórios

- Documento de identificação (RG/CNH) + CPF
- Comprovante de residência recente
- Extratos / histórico de contribuições INSS (CNIS ou equivalente) quando aplicável
- Cópias dos rendimentos informados pelas fontes pagadoras em DIRF
- Documentos que sustentem o pedido de restituição (conforme tese do caso — **a definir**)

### Frequentemente úteis (não bloqueantes até definição)

- Declarações de IR (anos relevantes)
- Holerites / recibos / notas
- Contratos / vínculos
- Procuração / autorização de representação (se já cliente)

### Sempre rejeitar / handoff

- Arquivo ilegível / cortado
- Formato não suportado
- Dados de terceiros sem vínculo claro
- Pedido de “garantia de restituição” / promessa ilegal

## Fluxo no WhatsApp (implementado)

1. Agente lista o que falta (checklist).
2. Lead envia mídia/documento.
3. Sistema baixa da Meta, salva no bucket `ir-documents`, grava sha256/mime/tamanho.
4. Atualiza pendências em `ir_cases.missing_information`.
5. Obrigatórios completos → `documents_complete` + `waiting_human` (fila Advbox depende da integração).

Tipos obrigatórios no código: `cnis` primeiro e `dirf_income` em seguida para apuração mais precisa.
(`REQUIRED_DOCUMENT_TYPES` em `backend/services/documents.ts`.)
Classificação hoje é **palpite pela legenda/nome** (`classification_status=auto_guess`); revisão humana obrigatória.

## Pendente de negócio

- Lista fechada por tese jurídica (quais anos, quais tipos de INSS, se limitado a categoria profissional, etc.).
