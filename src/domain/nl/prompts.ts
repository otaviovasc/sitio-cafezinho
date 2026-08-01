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
- Datas: preencha "relative" com "hoje", "ontem" ou "anteontem" quando a pessoa disser isso; preencha "iso" (AAAA-MM-DD) só quando uma data explícita for dita. Sempre copie o trecho original em "rawText".
- Em entradas com vários documentos, cada trecho começa com [Documento N]. Use essa numeração em sourceDocumentOrdinals. Não misture listas de lote, data ou período diferentes em uma única sessão.
- "Mesma data", "mesmo lote" e expressões equivalentes no contexto do usuário podem herdar o valor da foto anterior. Se não houver informação, devolva null; não use a data de hoje como palpite.`;

const OUTPUT_CONTRACT = `Responda SOMENTE com um objeto JSON válido, sem Markdown, no formato:
{ "intents": [ ... ] }
Cada item de "intents" tem um campo "type". Uma única fala pode conter várias ações (por exemplo, dois lotes).`;

// Descrição de cada tipo de ação suportado. Adicionar uma ação = acrescentar um bloco.
const ACTIONS = `Tipos de ação suportados:

1) "daily_milk_total" — produção total do dia, do rebanho todo ou de um lote.
   Campos: type, date, scopeLabel (rótulo do lote como falado, ou null para o rebanho todo), morningLiters, afternoonLiters, rawValueText, confidence, notes.
   Deixe morningLiters ou afternoonLiters em null quando o período não foi dito.

2) "individual_milk_session" — leitura vaca a vaca (controle individual).
   Campos: type, date, scopeLabel (rótulo do lote como escrito/falado, ou null), period ("MORNING", "AFTERNOON" ou null), sourceDocumentOrdinals (números dos documentos que originaram a lista), measurements[] com { animalLabel, morningLiters, afternoonLiters, totalLiters, rawValueText, confidence, notes }.
   Preencha só os valores ditos; deixe os demais em null. Se o período geral estiver claro, coloque cada valor somente no campo daquele período.

3) "milk_collection" — coleta do laticínio (volume retirado).
   Campos: type, date, liters, sourceLabel ("tanque", "caminhoneiro", "comprovante" ou null), rawValueText, confidence, notes.

4) "revenue" — entrada de dinheiro (receita).
   Campos: type, date, categoryLabel ("venda de leite", "venda de bezerro", "descarte", "venda de animal" ou null), description, amount, received (true se já recebida, false se a receber), buyerName, confidence, notes.

5) "purchase" — compra ou despesa (saída de dinheiro).
   Campos: type, date, categoryLabel ("ração", "mineral", "medicamento", "energia", "combustível", "manutenção" ou null), description, amount, supplierLabel (nome do fornecedor como falado ou null), dueDate (mesmo formato de date, ou null), paid (true se já paga), confidence, notes.

6) "mastitis_case" — caso de mastite. Registre apenas o fato observado; nunca diagnostique nem prescreva.
   Campos: type, date, animalLabel, quarterLabel ("posterior direito", "anterior esquerdo", etc. ou null), detectionLabel ("visual", "caneca de fundo preto", "CMT" ou null), observedSigns, confidence, notes.

7) "feed_purchase" — compra de ALIMENTO com quantidade dita (ração, silagem, mineral, farelo…). Use este tipo em vez de "purchase" quando a fala disser o item e a quantidade comprada; a compra financeira é criada junto e o estoque é creditado.
   Campos: type, date, itemLabel (o alimento como falado: "ração", "silagem de milho"), quantity (número dito), unitLabel (a unidade como falada: "sacos", "toneladas", "quilos", "litros" ou null), amount (valor total em reais ou null), supplierLabel, paid (true se já paga), rawValueText, confidence, notes.

8) "feeding_event" — trato dado ao rebanho (alimentação consumida, não comprada).
   Campos: type, date, contextLabel (onde foi dado, como falado: "na ordenha", "na estação", "no cocho", "no pasto" ou null), scopeLabel (rótulo do lote como falado ou null), lines[] com { itemLabel, quantity, unitLabel, rawValueText } — uma linha por alimento citado —, confidence, notes.

9) "weight_session" — pesagem do rebanho (uma linha por animal pesado).
   Campos: type, date, measurements[] com { animalLabel, weightKg (número em kg, ou null se o valor não foi dito ou está ilegível), rawValueText, confidence, notes }.
   "Mimosa 420, Estrela 385" são duas linhas. Nunca estime um peso; ilegível ou ausente = null.

10) "unknown" — a fala não corresponde a nenhuma ação acima. Campos: type, reason.`;

const EXAMPLES = `Exemplos:

Fala: "Hoje período da manhã, primeiro lote tirou 700 litros e o segundo lote tirou 300."
JSON: { "intents": [
  { "type": "daily_milk_total", "date": { "relative": "hoje", "iso": null, "rawText": "hoje" }, "scopeLabel": "primeiro lote", "morningLiters": 700, "afternoonLiters": null, "rawValueText": "700 litros de manhã", "confidence": "HIGH", "notes": null },
  { "type": "daily_milk_total", "date": { "relative": "hoje", "iso": null, "rawText": "hoje" }, "scopeLabel": "segundo lote", "morningLiters": 300, "afternoonLiters": null, "rawValueText": "300", "confidence": "HIGH", "notes": null }
] }

Fala: "Produção individual de ontem, primeiro lote de manhã. Mimosa 7 litros, Cocada 9 litros e meio."
JSON: { "intents": [
  { "type": "individual_milk_session", "date": { "relative": "ontem", "iso": null, "rawText": "ontem" }, "scopeLabel": "primeiro lote", "period": "MORNING", "sourceDocumentOrdinals": [], "measurements": [
    { "animalLabel": "Mimosa", "morningLiters": 7, "afternoonLiters": null, "totalLiters": 7, "rawValueText": "7 litros", "confidence": "HIGH", "notes": null },
    { "animalLabel": "Cocada", "morningLiters": 9.5, "afternoonLiters": null, "totalLiters": 9.5, "rawValueText": "9 litros e meio", "confidence": "HIGH", "notes": null }
  ] }
] }

Entrada com documentos:
Contexto: "Foto 1 lote 1, 28/07/2026 de manhã. Foto 2 mesmo lote e data à tarde. Foto 3 lote 2, mesma data de manhã."
[Documento 1: folha-1.jpg]
Mimosa 7; Cocada 9
[Documento 2: folha-2.jpg]
Mimosa 5; Cocada 6
[Documento 3: folha-3.jpg]
Estrela 8
JSON: { "intents": [
  { "type": "individual_milk_session", "date": { "relative": null, "iso": "2026-07-28", "rawText": "28/07/2026" }, "scopeLabel": "lote 1", "period": "MORNING", "sourceDocumentOrdinals": [1], "measurements": [
    { "animalLabel": "Mimosa", "morningLiters": 7, "afternoonLiters": null, "totalLiters": 7, "rawValueText": "7", "confidence": "HIGH", "notes": null },
    { "animalLabel": "Cocada", "morningLiters": 9, "afternoonLiters": null, "totalLiters": 9, "rawValueText": "9", "confidence": "HIGH", "notes": null }
  ] },
  { "type": "individual_milk_session", "date": { "relative": null, "iso": "2026-07-28", "rawText": "mesma data" }, "scopeLabel": "lote 1", "period": "AFTERNOON", "sourceDocumentOrdinals": [2], "measurements": [
    { "animalLabel": "Mimosa", "morningLiters": null, "afternoonLiters": 5, "totalLiters": 5, "rawValueText": "5", "confidence": "HIGH", "notes": null },
    { "animalLabel": "Cocada", "morningLiters": null, "afternoonLiters": 6, "totalLiters": 6, "rawValueText": "6", "confidence": "HIGH", "notes": null }
  ] },
  { "type": "individual_milk_session", "date": { "relative": null, "iso": "2026-07-28", "rawText": "mesma data" }, "scopeLabel": "lote 2", "period": "MORNING", "sourceDocumentOrdinals": [3], "measurements": [
    { "animalLabel": "Estrela", "morningLiters": 8, "afternoonLiters": null, "totalLiters": 8, "rawValueText": "8", "confidence": "HIGH", "notes": null }
  ] }
] }

Fala: "Comprei 40 sacos de ração por 3.200 reais."
JSON: { "intents": [
  { "type": "feed_purchase", "date": { "relative": null, "iso": null, "rawText": "" }, "itemLabel": "ração", "quantity": 40, "unitLabel": "sacos", "amount": 3200, "supplierLabel": null, "paid": false, "rawValueText": "40 sacos de ração por 3.200 reais", "confidence": "HIGH", "notes": null }
] }

Fala: "Dei 3 toneladas de silagem e 2 quilos de mineral pro lote 1 na ordenha."
JSON: { "intents": [
  { "type": "feeding_event", "date": { "relative": null, "iso": null, "rawText": "" }, "contextLabel": "na ordenha", "scopeLabel": "lote 1", "lines": [
    { "itemLabel": "silagem", "quantity": 3, "unitLabel": "toneladas", "rawValueText": "3 toneladas de silagem" },
    { "itemLabel": "mineral", "quantity": 2, "unitLabel": "quilos", "rawValueText": "2 quilos de mineral" }
  ], "confidence": "HIGH", "notes": null }
] }

Fala: "Pesagem de hoje: Mimosa 420, Estrela 385 e meio."
JSON: { "intents": [
  { "type": "weight_session", "date": { "relative": "hoje", "iso": null, "rawText": "hoje" }, "measurements": [
    { "animalLabel": "Mimosa", "weightKg": 420, "rawValueText": "420", "confidence": "HIGH", "notes": null },
    { "animalLabel": "Estrela", "weightKg": 385.5, "rawValueText": "385 e meio", "confidence": "HIGH", "notes": null }
  ] }
] }`;

export type InterpretContext = {
  now?: Date;
  lotNames?: string[];
  feedItemNames?: string[];
};

/** Monta o prompt de sistema para a interpretação, injetando a data de hoje e os lotes/itens conhecidos como referência. */
export function buildInterpretSystemPrompt(context: InterpretContext = {}): string {
  const today = dateKeyInSaoPaulo(context.now ?? new Date());
  const lots = context.lotNames?.length
    ? `\n\nLotes conhecidos (apenas referência para reconhecer os rótulos; ainda assim devolva o rótulo como falado): ${context.lotNames.join(', ')}.`
    : '';
  const feedItems = context.feedItemNames?.length
    ? `\n\nItens de alimentação conhecidos (mesma regra: devolva o rótulo como falado): ${context.feedItemNames.join(', ')}.`
    : '';
  return `${CONSTITUTION}\n\nHoje é ${today} (fuso de São Paulo).${lots}${feedItems}\n\n${ACTIONS}\n\n${EXAMPLES}\n\n${OUTPUT_CONTRACT}`;
}
