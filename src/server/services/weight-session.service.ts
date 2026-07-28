import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animalWeights, weightSessions } from '../../db/schema.js';
import { decimalString } from '../../domain/format.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText } from '../http/validation.js';

const weightStatusSchema = z.enum(['CONFIRMED', 'NEEDS_REVIEW', 'EXCLUDED']);

export const weightRowSchema = z.object({
  animalId: z.string().uuid().nullable(),
  rawAnimalLabel: z.string().trim().min(1).max(120),
  rawValueText: z.string().trim().max(120).nullable().optional(),
  weightKg: decimalInput.nullable(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  status: weightStatusSchema,
  notes: optionalText,
}).superRefine((value, context) => {
  if (value.status === 'CONFIRMED' && !value.animalId) context.addIssue({ code: 'custom', path: ['animalId'], message: 'Vincule um animal antes de confirmar.' });
  if (value.status === 'CONFIRMED' && value.weightKg === null) context.addIssue({ code: 'custom', path: ['weightKg'], message: 'Informe o peso antes de confirmar.' });
});

export const weightSessionCreateSchema = z.object({
  measuredOn: z.string().date(),
  title: z.string().trim().max(160).nullable().optional(),
  notes: optionalText,
  measurements: z.array(weightRowSchema).min(1).max(300),
});

export type WeightSessionCreate = z.infer<typeof weightSessionCreateSchema>;

/**
 * Cria a sessão de pesagem com suas linhas (fonte única: POST
 * /api/weight-sessions e o commit da ação proposta WEIGHT_SESSION). Linhas
 * NEEDS_REVIEW/EXCLUDED entram preservadas (rawAnimalLabel/rawValueText) e
 * ficam fora dos totais — nunca criam animal.
 */
export async function createWeightSession(body: WeightSessionCreate) {
  const confirmedIds = body.measurements.filter((row) => row.status === 'CONFIRMED').map((row) => row.animalId);
  if (new Set(confirmedIds).size !== confirmedIds.length) fail('Um animal aparece mais de uma vez entre as linhas confirmadas.', 409, 'DUPLICATE_ANIMAL');
  const [existing] = await getDb().select({ id: weightSessions.id }).from(weightSessions).where(eq(weightSessions.measuredOn, body.measuredOn)).limit(1);
  if (existing) fail('Já existe uma sessão de pesagem nesta data.', 409, 'DUPLICATE_DATE');
  return getDb().transaction(async (tx) => {
    const [created] = await tx.insert(weightSessions).values({ measuredOn: body.measuredOn, title: body.title || 'Pesagem do rebanho', source: 'IMPORT', notes: body.notes }).returning();
    await tx.insert(animalWeights).values(body.measurements.map((row) => ({
      animalId: row.animalId,
      weightSessionId: created.id,
      measuredAt: new Date(`${body.measuredOn}T12:00:00-03:00`),
      rawAnimalLabel: row.rawAnimalLabel,
      rawValueText: row.rawValueText,
      weightKg: row.weightKg === null ? null : decimalString(row.weightKg),
      confidence: row.confidence,
      status: row.status,
      notes: row.notes,
    })));
    return created;
  });
}
