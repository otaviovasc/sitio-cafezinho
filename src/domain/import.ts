import { z } from 'zod';

const nullableLiters = z.number().finite().nonnegative().nullable();

export const importMeasurementSchema = z.object({
  rawAnimalLabel: z.string().trim().min(1).nullable(),
  rawValueText: z.string().nullable().optional(),
  morningLiters: nullableLiters,
  afternoonLiters: nullableLiters,
  totalLiters: nullableLiters,
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  excluded: z.boolean(),
  notes: z.string().nullable().optional(),
}).superRefine((row, context) => {
  const parts = (row.morningLiters ?? 0) + (row.afternoonLiters ?? 0);
  if (row.rawAnimalLabel === null && !row.excluded) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rawAnimalLabel'], message: 'Informe o rótulo do animal ou marque a linha como excluída.' });
  }
  if (!row.excluded && row.totalLiters === null && row.morningLiters === null && row.afternoonLiters === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe pelo menos um valor de leite.' });
  }
  if (row.totalLiters !== null && (row.morningLiters !== null || row.afternoonLiters !== null) && Math.abs(parts - row.totalLiters) > 0.011) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Manhã + tarde diverge do total.' });
  }
}).transform((row) => ({ ...row, rawAnimalLabel: row.rawAnimalLabel ?? '[rótulo ilegível]' }));

export const chatGptImportSchema = z.object({
  sessionDate: z.string().date(),
  sourceMode: z.enum(['SEPARATE_MORNING_AFTERNOON', 'COMBINED_TOTAL', 'MIXED', 'UNKNOWN']),
  measurements: z.array(importMeasurementSchema).min(1),
});

export type ChatGptImport = z.infer<typeof chatGptImportSchema>;

export function stripMarkdownJson(input: string) {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export function parseChatGptImport(input: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(stripMarkdownJson(input));
  } catch {
    throw new Error('O conteúdo não é um JSON válido.');
  }
  return chatGptImportSchema.parse(raw);
}

const importFieldLabels: Record<string, string> = {
  rawAnimalLabel: 'rótulo do animal',
  morningLiters: 'litros da manhã',
  afternoonLiters: 'litros da tarde',
  totalLiters: 'total de litros',
  confidence: 'confiança',
  excluded: 'linha excluída',
  notes: 'observação',
};

export function formatChatGptImportIssues(error: z.ZodError) {
  return error.issues.map((issue) => {
    const measurementIndex = issue.path[0] === 'measurements' && typeof issue.path[1] === 'number' ? issue.path[1] : null;
    const field = measurementIndex === null ? issue.path.at(-1) : issue.path[2];
    const fieldLabel = typeof field === 'string' ? importFieldLabels[field] : undefined;
    const location = measurementIndex === null ? 'Dados da importação' : `Linha ${measurementIndex + 1}`;
    return `${location}${fieldLabel ? ` · ${fieldLabel}` : ''}: ${issue.message}`;
  }).join('\n');
}
