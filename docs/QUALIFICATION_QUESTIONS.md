# Perguntas de qualificação — Restituição INSS

Alinhado a `prompts/knowledge/IR_CONSULTORIA_CEREBRO_AGENTE.md` v1.1.0.
Uma pergunta por vez. Não confirma direito.

## Ordem sugerida

0. **Nome** — se ainda não houver, cumprimentar + apresentar a IR + pedir o primeiro nome. Nunca perguntar o nome sem saudação.
1. **Conhecimento** — Já conhecia a Restituição do INSS?
2. **Pergunta essencial** — Nos últimos anos, você trabalhou ao mesmo tempo em duas ou mais instituições (hospitais, clínicas, cooperativas, órgãos públicos)?
3. **Documento inicial** — CNIS no Meu INSS, opção **“Vínculos, contribuições e remunerações”**. O sistema anexa um PDF único com o passo a passo do CNIS e das DIRF's. Ao pedir o CNIS, avisar que as DIRFs/rendimentos também serão necessárias para uma análise mais precisa.
4. **DIRF / rendimentos** — orientar cópias dos rendimentos informados pelas fontes pagadoras em DIRF pelo mesmo PDF operacional aprovado.

## Regra prática

- Se o lead **já conhece** o assunto, vá direto para a pergunta essencial.
- Se o lead **não conhece**, explique em poucas frases e termine com a pergunta essencial.
- Se ele respondeu **sim** para múltiplos vínculos, peça CNIS.
- Se respondeu **não**, diga que a chance reduz, mas peça CNIS para triagem sem parecer definitivo.
- Se respondeu **não sei / não lembro**, peça CNIS para a equipe verificar.
- Não fazer bateria longa de profissão, tipos, anos, INSS e análise anterior, salvo se surgir naturalmente ou for indispensável.

## Encaminhamentos

| Situação | Ação |
|----------|------|
| Um único vínculo claro em todo o período / nunca INSS / cadastro errado | Chance reduzida; pedir CNIS se fizer sentido; sem parecer definitivo; humano se pedir |
| Incerto / restituição anterior / processo | Humano |
| Pediu para parar | Opt-out |
| Pediu humano | `waiting_human` |
| Indícios + CNIS | Triagem humana; DIRF/rendimentos para precisão |

## Linguagem

- "indícios que justificam análise" / "depende dos documentos e da equipe"
- **Não:** direito garantido, valores, prazos de pagamento
