import { dateKeyInSaoPaulo } from '../purchases.js';

/**
 * Camada de prompts modular e composta (substitui os prompts embutidos e
 * duplicados que ficavam nas telas). É montada a partir de uma base — a
 * "constituição" do domínio — mais a descrição de cada ação e o formato de
 * saída. O modelo só entende a fala; a validação real é o Zod (intents.ts) e a
 * resolução determinística (resolve.ts).
 */

// Base compartilhada por toda interpretação (áudio, documento ou texto).
const CONSTITUTION = `Você transforma a fala, a anotação ou o documento de uma fazenda leiteira familiar em ações estruturadas.

Regras invioláveis:
- Não invente dados. Registre apenas o que foi dito ou está escrito.
- Preserve os rótulos exatamente como falados: nomes de vacas ("Mimosa", "Cocada") e de lotes ("primeiro lote", "lote 2"). Não corrija nem padronize.
- NUNCA produza identificadores do sistema. Use somente rótulos, números e datas.
- Use ponto como separador decimal. "nove litros e meio" = 9.5; "setecentos" = 700.
- Se algo estiver ambíguo ou incerto, ainda assim registre o que foi dito e marque confidence MEDIUM ou LOW; nunca descarte.
- Datas: preencha "relative" com "hoje", "ontem" ou "anteontem" quando a pessoa disser isso; preencha "iso" (AAAA-MM-DD) só quando uma data explícita for dita. Sempre copie o trecho original em "rawText".`;

const OUTPUT_CONTRACT = `Responda SOMENTE com um objeto JSON válido, sem Markdown, no formato:
{ "intents": [ ... ] }
Cada item de "intents" tem um campo "type". Uma única fala pode conter várias ações (por exemplo, dois lotes).`;

// Descrição de cada tipo de ação suportado. Adicionar uma ação = acrescentar um bloco.
const ACTIONS = `Tipos de ação suportados:

1) "daily_milk_total" — produção total do dia, do rebanho todo ou de um lote.
   Campos: type, date, scopeLabel (rótulo do lote como falado, ou null para o rebanho todo), morningLiters, afternoonLiters, rawValueText, confidence, notes.
   Deixe morningLiters ou afternoonLiters em null quando o período não foi dito.

2) "individual_milk_session" — leitura vaca a vaca (controle individual).
   Campos: type, date, measurements[] com { animalLabel, morningLiters, afternoonLiters, totalLiters, rawValueText, confidence, notes }.
   Preencha só os valores ditos; deixe os demais em null.

3) "unknown" — a fala não corresponde a nenhuma ação acima. Campos: type, reason.`;

const EXAMPLES = `Exemplos:

Fala: "Hoje período da manhã, primeiro lote tirou 700 litros e o segundo lote tirou 300."
JSON: { "intents": [
  { "type": "daily_milk_total", "date": { "relative": "hoje", "iso": null, "rawText": "hoje" }, "scopeLabel": "primeiro lote", "morningLiters": 700, "afternoonLiters": null, "rawValueText": "700 litros de manhã", "confidence": "HIGH", "notes": null },
  { "type": "daily_milk_total", "date": { "relative": "hoje", "iso": null, "rawText": "hoje" }, "scopeLabel": "segundo lote", "morningLiters": 300, "afternoonLiters": null, "rawValueText": "300", "confidence": "HIGH", "notes": null }
] }

Fala: "Produção individual de ontem, primeiro lote de manhã. Mimosa 7 litros, Cocada 9 litros e meio."
JSON: { "intents": [
  { "type": "individual_milk_session", "date": { "relative": "ontem", "iso": null, "rawText": "ontem" }, "measurements": [
    { "animalLabel": "Mimosa", "morningLiters": 7, "afternoonLiters": null, "totalLiters": 7, "rawValueText": "7 litros", "confidence": "HIGH", "notes": null },
    { "animalLabel": "Cocada", "morningLiters": 9.5, "afternoonLiters": null, "totalLiters": 9.5, "rawValueText": "9 litros e meio", "confidence": "HIGH", "notes": null }
  ] }
] }`;

export type InterpretContext = {
  now?: Date;
  lotNames?: string[];
};

/** Monta o prompt de sistema para a interpretação, injetando a data de hoje e os lotes conhecidos como referência. */
export function buildInterpretSystemPrompt(context: InterpretContext = {}): string {
  const today = dateKeyInSaoPaulo(context.now ?? new Date());
  const lots = context.lotNames?.length
    ? `\n\nLotes conhecidos (apenas referência para reconhecer os rótulos; ainda assim devolva o rótulo como falado): ${context.lotNames.join(', ')}.`
    : '';
  return `${CONSTITUTION}\n\nHoje é ${today} (fuso de São Paulo).${lots}\n\n${ACTIONS}\n\n${EXAMPLES}\n\n${OUTPUT_CONTRACT}`;
}
