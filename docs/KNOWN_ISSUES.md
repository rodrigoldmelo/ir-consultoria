# KNOWN ISSUES — IR Consultoria
**Atualizado:** 2026-08-18

## ABERTOS (produto)

### Critérios de elegibilidade ainda não definidos
Bloqueia Qualification Engine estruturado (hoje prompt + fallback).

### Checklist documental ainda rascunho
Pipeline de download/storage funciona, mas a lista obrigatória (`REQUIRED_DOCUMENT_TYPES`) é proposta e a classificação é palpite pela legenda. Validar com a operação e trocar por classificador.

### Bucket `ir-documents` sem teste E2E
Upload/URL assinada só serão exercitados quando chegar mídia real pelo webhook.

### WABA / templates em aprovação
Outreach ativo, drip e reheat E2E dependem de templates aprovados + opt-in. Inbound Cloud API já funciona. `#133010` no envio = Phone number ID (não WABA ID) errado ou número não registrado.

### Cópia de template duplicada em código
`services/template-copy.ts` repete o texto aprovado na Meta só para histórico/contexto.
Se editar o template na Meta, atualizar lá também (senão o agente vê contexto errado).

### Advbox API não mapeada
Endpoints, auth, entidade (cliente/caso/tarefa) pendentes.

### Webhook responde 200 só depois de processar tudo
Corrigido (2026-08-19): `POST /api/ir/webhooks/whatsapp` dá ACK e processa em seguida; `external_message_id` evita duplicata.

### Tabelas `ir_*` sem RLS
Instância Supabase compartilhada com a Lis. A anon key hoje só é usada server-side
(verificado no Conversa Hub), então a exposição é contida — mas dados de médicos
(nome, telefone, documentos) seguem sem política de acesso. Migration 0004 pendente.

## RISCOS HERDADOS DO PADRÃO META (da Lis)

- Token de usuário expira (~60d) → preferir System User.
- Template 132001 se nome/idioma errados.
- Janela 24h: após reply do lead, free-text; antes, só template.
- Reply humano fora da janela falha na Graph — usar template de reheat.
