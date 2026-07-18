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

// Coleta do laticínio.
export const milkCollectionIntent = z.object({
  type: z.literal('milk_collection'),
  date: spokenDateSchema,
  liters: z.number().nonnegative().nullable(),
  sourceLabel: z.string().nullable(),
  rawValueText: z.string().nullable(),
  confidence,
  notes: z.string().nullable(),
});
export type MilkCollectionIntent = z.infer<typeof milkCollectionIntent>;

// Receita (entrada de caixa).
export const revenueIntent = z.object({
  type: z.literal('revenue'),
  date: spokenDateSchema,
  categoryLabel: z.string().nullable(),
  description: z.string(),
  amount: z.number().nonnegative().nullable(),
  received: z.boolean(),
  buyerName: z.string().nullable(),
  confidence,
  notes: z.string().nullable(),
});
export type RevenueIntent = z.infer<typeof revenueIntent>;

// Compra ou despesa (saída de caixa).
export const purchaseIntent = z.object({
  type: z.literal('purchase'),
  date: spokenDateSchema,
  categoryLabel: z.string().nullable(),
  description: z.string(),
  amount: z.number().nonnegative().nullable(),
  supplierLabel: z.string().nullable(),
  dueDate: spokenDateSchema.nullable(),
  paid: z.boolean(),
  confidence,
  notes: z.string().nullable(),
});
export type PurchaseIntent = z.infer<typeof purchaseIntent>;

// Caso de mastite (observação + decisão humana; nunca diagnóstico automático).
export const mastitisIntent = z.object({
  type: z.literal('mastitis_case'),
  date: spokenDateSchema,
  animalLabel: z.string(),
  quarterLabel: z.string().nullable(),
  detectionLabel: z.string().nullable(),
  observedSigns: z.string().nullable(),
  confidence,
  notes: z.string().nullable(),
});
export type MastitisIntent = z.infer<typeof mastitisIntent>;

// Compra de alimento com quantidade (credita o inventário além da compra).
// O modelo devolve rótulos como falados ("sacos", "toneladas"); a conversão
// para a unidade canônica é determinística no resolvedor.
export const feedPurchaseIntent = z.object({
  type: z.literal('feed_purchase'),
  date: spokenDateSchema,
  itemLabel: z.string().min(1),
  quantity: z.number().positive().nullable(),
  unitLabel: z.string().nullable(),
  amount: z.number().nonnegative().nullable(),
  supplierLabel: z.string().nullable(),
  paid: z.boolean(),
  rawValueText: z.string().nullable(),
  confidence,
  notes: z.string().nullable(),
});
export type FeedPurchaseIntent = z.infer<typeof feedPurchaseIntent>;

// Trato (evento de alimentação): uma fala pode ter várias linhas item+quantidade.
export const feedingLineIntent = z.object({
  itemLabel: z.string().min(1),
  quantity: z.number().positive().nullable(),
  unitLabel: z.string().nullable(),
  rawValueText: z.string().nullable(),
});
export type FeedingLineIntent = z.infer<typeof feedingLineIntent>;

export const feedingEventIntent = z.object({
  type: z.literal('feeding_event'),
  date: spokenDateSchema,
  contextLabel: z.string().nullable(),
  scopeLabel: z.string().nullable(),
  lines: z.array(feedingLineIntent).min(1),
  confidence,
  notes: z.string().nullable(),
});
export type FeedingEventIntent = z.infer<typeof feedingEventIntent>;

// A fala não corresponde a nenhuma ação reconhecida.
export const unknownIntent = z.object({
  type: z.literal('unknown'),
  reason: z.string(),
});

export const voiceIntentSchema = z.discriminatedUnion('type', [
  dailyMilkTotalIntent,
  individualMilkSessionIntent,
  milkCollectionIntent,
  revenueIntent,
  purchaseIntent,
  mastitisIntent,
  feedPurchaseIntent,
  feedingEventIntent,
  unknownIntent,
]);
export type VoiceIntent = z.infer<typeof voiceIntentSchema>;

// Uma fala pode conter várias ações (ex.: dois lotes numa frase só).
export const interpretationSchema = z.object({
  intents: z.array(voiceIntentSchema).min(1),
});
export type Interpretation = z.infer<typeof interpretationSchema>;
