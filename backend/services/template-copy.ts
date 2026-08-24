/**
 * Cópia dos templates aprovados na Meta — usada só para histórico/painel e como
 * contexto do agente. O envio continua sendo por nome do template (Cloud API).
 * Manter em sincronia com `docs/META_OUTREACH.md`.
 */
const TEMPLATE_BODIES: Record<string, string> = {
  contato_inicial:
    "Olá, {{1}}! Aqui é da IR Consultoria, assessoria especializada em Restituição de contribuições ao INSS para médicos. Recebemos o seu cadastro para verificar se existem valores de INSS que possam ser restituídos. Já recuperamos mais de R$ 25 milhões em valores para clientes. Posso fazer algumas perguntas rápidas e orientar você sobre a análise inicial gratuita? Para sua segurança, nunca solicitamos senha do gov.br. [botões: Sim / Não tenho mais interesse]",
  primeiro_contato:
    "Olá, {{1}}. Aqui é da IR Consultoria, maior consultoria especializada em Restituição do INSS para Médicos do Brasil. Recebemos seu cadastro para análise de possível restituição junto ao INSS. Posso fazer algumas perguntas rápidas e te orientar sobre os documentos necessários? [botões: Sim / Não tenho interesse]",
  ir_confianca:
    "{{1}}, aqui é a IR Consultoria. Não pedimos senha do gov.br, PIX nem taxa para “liberar” nada. Se ainda quiser, responda esta mensagem que eu te oriento sobre a análise de indício de restituição do INSS (sem garantia de valor). [botões: Quero continuar / Não tenho interesse]",
  ir_explica_inss:
    "{{1}}, muita gente confunde com restituição de Imposto de Renda. Aqui o foco é contribuição ao INSS. A decisão final é humana. Se preferir, responda “quero entender” ou “parar”. [botões: Quero entender / Parar]",
  ir_lembrete_cnis:
    "Olá, {{1}}, tudo bem? Passando para lembrar sobre o envio do CNIS (Extrato de Contribuições) e das DIRF's/rendimentos. Com esses documentos, nossa equipe consegue fazer uma análise mais precisa sobre possível restituição de contribuições ao INSS. Se tiver qualquer dúvida para baixar, posso te ajudar por aqui.",
  lembrete_cnis:
    "Olá, {{1}}, tudo bem? Passando para lembrar sobre o envio do CNIS (Extrato de Contribuições) e das DIRF's/rendimentos. Com esses documentos, nossa equipe consegue fazer uma análise mais precisa sobre possível restituição de contribuições ao INSS. Se tiver qualquer dúvida para baixar, posso te ajudar por aqui.",
  cnis_reminder:
    "Olá, {{1}}, tudo bem? Passando para lembrar sobre o envio do CNIS (Extrato de Contribuições) e das DIRF's/rendimentos. Com esses documentos, nossa equipe consegue fazer uma análise mais precisa sobre possível restituição de contribuições ao INSS. Se tiver qualquer dúvida para baixar, posso te ajudar por aqui.",
  lembrete_envio_cnis_03:
    "Olá Dr(a). {{1}}. Para avançarmos com sua análise gratuita, ainda precisamos do seu CNIS — Extrato de Contribuições do INSS.\n\nEsse documento permite que nossa equipe faça uma avaliação inicial dos seus vínculos e contribuições.\n\nVocê mesmo deve acessar o Meu INSS e baixar o documento. A IR Consultoria nunca solicita sua senha do gov.br.\nIR Consultoria | Atendimento nacional\n[botões: Quero enviar o CNIS / Preciso de ajuda / Encerrar contato]",
  continuar_analise_inss_02:
    "Olá Dr(a). {{1}}. Seu atendimento sobre a análise de possíveis contribuições ao INSS ficou incompleto.\n\nPodemos continuar de onde paramos. São necessárias apenas algumas informações para verificarmos se o seu caso apresenta indícios para análise.\n\nA análise inicial é gratuita!\nNunca solicitamos nenhuma senha ou código de acesso.\n[botões: Continuar atendimento / Falar com especialista / Encerrar contato]",
  retomar_analise_inss_01:
    "Olá Dr(a). {{1}}. Recebemos recentemente seu cadastro na IR Consultoria para uma análise gratuita de possível restituição de contribuições ao INSS.\n\nNão conseguimos dar continuidade ao seu atendimento. Você ainda deseja verificar se existem valores que podem ser analisados?\nNão solicitamos senha GOV.BR, nem nenhum tipo de pagamento.\n[botões: Sim / Não tenho mais interesse]",
};

export function renderTemplateBody(
  templateName: string,
  parameters: string[] = [],
): string {
  const body = TEMPLATE_BODIES[templateName];
  if (!body) {
    return parameters.length
      ? `[template ${templateName}: ${parameters.join(", ")}]`
      : `[template ${templateName}]`;
  }
  return body.replace(/\{\{(\d+)\}\}/g, (_match, index) => {
    const value = parameters[Number(index) - 1];
    return value ?? "";
  });
}
