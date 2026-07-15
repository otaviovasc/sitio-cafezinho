import { z } from 'zod';

const nullableLiters = z.number().finite().nonnegative().nullable();

export const importMeasurementSchema = z.object({
  rawAnimalLabel: z.string().trim().min(1),
  rawValueText: z.string().nullable().optional(),
  morningLiters: nullableLiters,
  afternoonLiters: nullableLiters,
  totalLiters: nullableLiters,
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  excluded: z.boolean(),
  notes: z.string().nullable().optional(),
}).superRefine((row, context) => {
  const parts = (row.morningLiters ?? 0) + (row.afternoonLiters ?? 0);
  if (row.totalLiters === null && row.morningLiters === null && row.afternoonLiters === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe pelo menos um valor de leite.' });
  }
  if (row.totalLiters !== null && (row.morningLiters !== null || row.afternoonLiters !== null) && Math.abs(parts - row.totalLiters) > 0.011) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Manhã + tarde diverge do total.' });
  }
});

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
