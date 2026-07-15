import { z } from 'zod';
import { stripMarkdownJson } from './import.js';

export function weightChange(current: string | number, previous: string | number | null | undefined) {
  if (previous === null || previous === undefined) return null;
  return Math.round((Number(current) - Number(previous)) * 100) / 100;
}

export const weightImportSchema = z.object({
  measuredOn: z.string().date(),
  measurements: z.array(z.object({
    rawAnimalLabel: z.string().trim().min(1),
    rawValueText: z.string().trim().max(120).nullable().optional(),
    weightKg: z.number().finite().positive().nullable(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    excluded: z.boolean().default(false),
    notes: z.string().trim().max(500).nullable().optional(),
  })).min(1),
});

export function parseWeightImport(input: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(stripMarkdownJson(input));
  } catch {
    throw new Error('O conteúdo não é um JSON válido.');
  }
  return weightImportSchema.parse(raw);
}

export function formatWeight(value: string | number) {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
}
