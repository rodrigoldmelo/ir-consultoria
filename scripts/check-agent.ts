/**
 * Testa o prompt do agente sem passar pelo WhatsApp (não gera custo Meta).
 * Uso: npm run check:agent -- "mensagem do lead"
 */
import "../backend/env.js";
import { config } from "../backend/config.js";
import {
  generateAgentReply,
  generateFirstContactReply,
  isOpenAiConfigured,
} from "../backend/services/openai-agent.js";
import { renderTemplateBody } from "../backend/services/template-copy.js";
import {
  firstNameFromLead,
  isTemplateAccept,
  renderPostTemplateBriefing,
} from "../backend/services/post-template-briefing.js";

const DEFAULT_CASES = [
  "Sim",
  "isso é golpe? nunca ouvi falar em restituição de INSS",
  "sou médico, tenho CLT no hospital e também PJ na clínica",
  "quanto eu vou receber?",
];

/** Toda conversa real começa com o template já enviado. */
const HISTORY = [
  {
    role: "assistant",
    text: renderTemplateBody(config.meta.templateInitial || "contato_inicial", [
      "Rodrigo",
    ]),
  },
];

async function main(): Promise<void> {
  if (!isOpenAiConfigured()) {
    console.error("IR_OPENAI_API_KEY ausente no .env.local");
    process.exit(1);
  }

  const custom = process.argv.slice(2).filter(Boolean);
  const cases = custom.length ? custom : DEFAULT_CASES;

  console.log(`== check:agent (${config.openai.model}) ==\n`);

  for (const userText of cases) {
    const reply = isTemplateAccept(userText)
      ? ((await generateFirstContactReply({
          userText,
          firstName: firstNameFromLead("Rodrigo"),
        })) ?? renderPostTemplateBriefing("Rodrigo"))
      : await generateAgentReply({
          userText,
          history: HISTORY,
          honorific: "Dr(a). Rodrigo",
          needsName: false,
          briefingDone: true,
        });
    console.log(`LEAD:   ${userText}`);
    console.log(
      `AGENTE: ${reply ?? "(sem resposta — ver erro acima)"}${
        isTemplateAccept(userText) ? "  [abertura 1º contato]" : ""
      }\n`,
    );
    if (!reply) process.exitCode = 1;
  }
}

void main();
