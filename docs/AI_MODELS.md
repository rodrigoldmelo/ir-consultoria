# Modelos de IA — IR Consultoria (cérebro / arquitetura)

**Atualizado:** 2026-08-12
**Princípio:** modelos certos por função; regras determinísticas **antes** do LLM; decisão jurídica final sempre humana.

---

## Mapa oficial (runtime WhatsApp + painel)

| Função | Modelo recomendado | Por quê |
|--------|-------------------|---------|
| **Chat WhatsApp** (qualificação, tom, CTA docs) | `gpt-4o-mini` | Barato, rápido, bom em PT-BR curto; janela 24h |
| **Extração estruturada** (CPF, campos, checklist) | `gpt-4o-mini` JSON mode | Determinístico + schema; barato |
| **Classificação de documento** (RG vs CNIS vs outro) | `gpt-4o-mini` vision / texto | Suficiente para triagem; humano confirma |
| **Análise fria de histórico / reaquecer** | `gpt-4o` ou `claude-sonnet-4` | Precisa de julgamento + nuance; batch offline |
| **Resumo de caso para Advbox** | `gpt-4o-mini` | Relatório curto operacional |
| **Arquitetura / prompts / isolamento (Cursor)** | Claude Opus / Sonnet thinking | Você + agente no repo |
| **Scaffold / CRUD / painel (Cursor)** | Composer / Auto | Velocidade de implementação |
| **Revisão jurídica de prompt** | Humano + Opus se necessário | Nunca automação sozinha |

### Env (já previsto)

```env
IR_OPENAI_MODEL=gpt-4o-mini          # chat
IR_OPENAI_EXTRACTION_MODEL=gpt-4o-mini
IR_OPENAI_REHEAT_MODEL=gpt-4o        # análise de histórico (novo)
```

---

## Camadas (não pular)

```text
1. Regras determinísticas (opt-out, humano, mídia, status)
2. Extrator estruturado (JSON)
3. LLM de conversa (só se passou regras)
4. Fila humana se ambíguo / risco / pedido
```

---

## Funções novas do produto (além da Lis)

| Módulo | Função | Modelo |
|--------|--------|--------|
| **Import histórico WA** | Parse export / CSV / JSON → `ir_*` | Sem LLM (parser) |
| **Agente Reaquecer** | Score frio: chance de reabrir | `gpt-4o` / Sonnet |
| **Agente Reanálise** | Casos antigos sem fechar | `gpt-4o` + checklist |
| **Outreach ativo** | Template pós-form | Sem LLM (Meta template) |
| **Orquestrador** | Conversa pós-reply | `gpt-4o-mini` |

Ver `docs/WHATSAPP_HISTORY_AND_REHEAT.md`.

---

## O que NÃO usar

- Modelo “forte” em toda mensagem → custo e latência.
- Copiar prompts / Calendar da Lis.
- LLM para decidir restituição final.

---

## Cursor (este repo)

| Tarefa no Cursor | Modelo |
|------------------|--------|
| Arquitetura, prompts, isolamento | Claude Opus / Sonnet high |
| Feature / painel / stubs | Composer / Auto |
| Review segurança | Security Review skill |
| Bugbot | só sob pedido |
