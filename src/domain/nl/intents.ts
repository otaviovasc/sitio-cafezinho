import { z } from 'zod';

/**
 * Esquema das intenções que o modelo pode devolver a partir de uma fala,
 * anotação ou documento. Princípio central: o modelo só entende linguagem.
 * Ele devolve rótulos falados, números e tokens de data — NUNCA IDs do banco
 * nem fatos resolvidos. Toda resolução (lote, animal, data) é determinística e
 * acontece no servidor (ver resolve.ts). Por isso não existe nenhum campo de ID
 * neste arquivo: é a garantia estrutural de que o modelo não inventa vínculos.
 */

const confidence = z.enum(['HIGH', 'MEDIUM', 'LOW']);

// Data dita em linguagem natural. `relative` para "hoje/ontem/anteontem";
// `iso` apenas quando uma data explícita for dita; `rawText` guarda o original.
export const spokenDateSchema = z.object({
  relative: z.enum(['hoje', 'ontem', 'anteontem']).nullable(),
  iso: z.string().nullable(),
  rawText: z.string(),
});
export type SpokenDate = z.infer<typeof spokenDateSchema>;

// Total diário do rebanho todo (scopeLabel null) ou de um lote falado.
export const dailyMilkTotalIntent = z.object({
  type: z.literal('daily_milk_total'),
  date: spokenDateSchema,
  scopeLabel: z.string().nullable(),
  morningLiters: z.number().nonnegative().nullable(),
  afternoonLiters: z.number().nonnegative().nullable(),
  rawValueText: z.string().nullable(),
  confidence,
  notes: z.string().nullable(),
});
export type DailyMilkTotalIntent = z.infer<typeof dailyMilkTotalIntent>;

// Controle individual: uma lista de vacas com seus litros.
export const individualMilkMeasurementIntent = z.object({
  animalLabel: z.string().min(1),
  rawValueText: z.string().nullable(),
  morningLiters: z.number().nonnegative().nullable(),
  afternoonLiters: z.number().nonnegative().nullable(),
  totalLiters: z.number().nonnegative().nullable(),
  confidence,
  notes: z.string().nullable(),
});

export const individualMilkSessionIntent = z.object({
  type: z.literal('individual_milk_session'),
  date: spokenDateSchema,
  measurements: z.array(individualMilkMeasurementIntent).min(1),
});
export type IndividualMilkSessionIntent = z.infer<typeof individualMilkSessionIntent>;

// A fala não corresponde a nenhuma ação reconhecida.
export const unknownIntent = z.object({
  type: z.literal('unknown'),
  reason: z.string(),
});

export const voiceIntentSchema = z.discriminatedUnion('type', [
  dailyMilkTotalIntent,
  individualMilkSessionIntent,
  unknownIntent,
]);
export type VoiceIntent = z.infer<typeof voiceIntentSchema>;

// Uma fala pode conter várias ações (ex.: dois lotes numa frase só).
export const interpretationSchema = z.object({
  intents: z.array(voiceIntentSchema).min(1),
});
export type Interpretation = z.infer<typeof interpretationSchema>;
