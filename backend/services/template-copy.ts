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
