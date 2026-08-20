# Confiança + drip de templates (IR Consultoria)

**Contexto de produto:** Restituição do **INSS** é pouco conhecida (≠ restituição de IR). Leads chegam com medo de golpe. O funil precisa ser **mais lento, transparente e confiável** do que um chatbot agressivo.

**Atualizado:** 2026-08-19

---

## Princípios de confiança (obrigatórios no agente e nos templates)

1. **Nunca** prometer valor, prazo ou “você tem direito garantido”.
2. Deixar claro: empresa **IR Consultoria Contábil e Previdenciária**, análise **humana** no fim.
3. Explicar diferença: restituição INSS ≠ restituição Imposto de Renda.
4. Validar desconfiança: “é normal ter dúvida; não pedimos senha, PIX antecipado nem dados de cartão”.
5. Uma pergunta por vez; docs só depois de confiança mínima.
6. Opt-out imediato e fácil.
7. Ritmo: preferir **cadência** a pressão (drip espaçado).

---

## Dois motores de disparo (templates Meta)

### A) Lead novo — sem 1ª resposta (janela 24h fechou)

```text
form → template #1 (boas-vindas)
  → awaiting_first_reply
  → se NÃO houver inbound em T1 (24h)
       → template #2 (confiança / esclarecimento)
  → se ainda sem reply em T2 (+5d)
       → template #3 (explica INSS)
  → se ainda frio → pause / lost (sem spam)
```

Requer: opt-in no formulário + templates **aprovados** + worker `IR_FOLLOW_UP_WORKER_ENABLED`.

### B) Histórico importado + leads frios (reaquecer)

```text
import WA / lead antigo
  → agente frio (gpt-4o) → ir_reheat_scores
  → fila painel "Reaquecer"
  → humano aprova um a um ou em lote pequeno
  → template de reativação
```

**Bulk automático sem humano = proibido** (risco de spam + marca).

---

## Templates sugeridos (criar na Meta — pt_BR)

| Código interno | Uso | Tom |
|----------------|-----|-----|
| `contato_inicial` | Pós-form (#1) | Cadastro recebido |
| `ir_confianca` | Drip sem reply (#2) | Nome da empresa, sem pedido de doc/PIX |
| `ir_explica_inss` | Drip (#3) | INSS ≠ IR; análise humana |
| `ir_reativacao` | Reheat aprovado | “Continuamos de onde paramos?” |

Textos finais: jurídico + Meta approval. Rascunhos em `docs/META_OUTREACH.md`.

---

## Cadência recomendada (ajustável)

| Momento | Ação |
|---------|------|
| T0 | Template boas-vindas |
| T0+24h sem reply | Template confiança (`ir_confianca`) |
| T0+5d sem reply | Template explica INSS (`ir_explica_inss`) |
| Depois | Parar; só reheat humano se histórico importado |
| Na janela 24h, após 1ª resposta | Lembrete em texto (`IR_INWINDOW_NUDGE_ENABLED`; padrão 4h de silêncio) |

---

## Schema / worker

- Migration `0003_template_drip.sql` — fila `ir_template_drip_jobs` (**aplicar no Supabase**)
- Worker: `backend/workers/follow-up-worker.ts` (real; agenda via `drip.ts` após template #1)
- Flag: `IR_FOLLOW_UP_WORKER_ENABLED=true` só com templates TRUST/EXPLAIN + opt-in ok
- Step 2 padrão: **24h** (`IR_DRIP_STEP2_HOURS`)
- Lembrete dentro da janela: `backend/workers/in-window-nudge-worker.ts` (`IR_INWINDOW_NUDGE_ENABLED`, off por padrão)
- Cancel automático: 1ª resposta inbound ou opt-out (`cancelDripForPhone`)

---

## Prompt do agente

Ver `prompts/agent-system-prompt.md` — bloco **Confiança / anti-golpe**.
