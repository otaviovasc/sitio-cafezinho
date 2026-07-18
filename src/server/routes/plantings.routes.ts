import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { feedItems, mapInstallations, plantingInputs, plantings, type Planting, type PlantingInput } from '../../db/schema.js';
import { feedUnitSuffix, linesBeyondBalance } from '../../domain/feeding.js';
import { growthProgress, growthStage, plantingReadyAt } from '../../domain/game/planting.js';
import { GUARDRAILS } from '../../domain/guardrails.js';
import { fail } from '../http/api-error.js';
import { loadFeedInventory } from '../services/feed-inventory.js';
import { optionalText, readJson, validate } from '../http/validation.js';

/**
 * Plantação: plantio com insumos DO DEPÓSITO → crescimento por relógio →
 * colheita. Os insumos debitam o saldo derivado do inventário (como um trato);
 * uso além do saldo avisa (409 BEYOND_BALANCE) e pede confirmação, sem
 * bloquear. O servidor é quem decide "pronto" (growthProgress ≥ 1) — o cliente
 * só desenha. A colheita devolve o ciclo completo com os insumos gastos, para
 * a folha mostrar "você investiu X → colheu Y".
 */

const inputSchema = z.object({
  feedItemId: z.string().uuid(),
  quantity: z.number().positive('Informe uma quantidade maior que zero.').max(GUARDRAILS.feedQuantity.max),
});

const plantingSchema = z.object({
  cropName: z.string().trim().min(1, 'Informe o que foi plantado.').max(120),
  durationHours: z.number().positive('Informe uma duração maior que zero.').max(24 * 366, 'Duração máxima: 1 ano.'),
  inputs: z.array(inputSchema).min(1, 'Adicione ao menos um insumo do depósito (ex.: sementes).').max(20),
  notes: optionalText,
  confirmBeyondBalance: z.boolean().optional().default(false),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  for (const input of value.inputs) {
    if (seen.has(input.feedItemId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['inputs'], message: 'O mesmo insumo aparece em mais de uma linha; some as quantidades.' });
      return;
    }
    seen.add(input.feedItemId);
  }
});

const harvestSchema = z.object({
  quantity: z.number().positive('Informe uma quantidade maior que zero.').max(10_000_000),
  unit: z.string().trim().min(1, 'Informe a unidade.').max(20),
  notes: optionalText,
});

function serialize(row: Planting, inputs: PlantingInput[], now: Date) {
  const durationHours = Number(row.durationHours);
  const progress = row.status === 'GROWING' ? growthProgress(row.plantedAt, durationHours, now) : 1;
  return {
    id: row.id,
    installationId: row.installationId,
    cropName: row.cropName,
    plantedAt: row.plantedAt.toISOString(),
    durationHours,
    readyAt: plantingReadyAt(row.plantedAt, durationHours).toISOString(),
    progress,
    stage: growthStage(progress),
    status: row.status,
    harvestedAt: row.harvestedAt ? row.harvestedAt.toISOString() : null,
    harvestQuantity: row.harvestQuantity === null ? null : Number(row.harvestQuantity),
    harvestUnit: row.harvestUnit,
    notes: row.notes,
    inputs: inputs.map((input) => ({ name: input.name, quantity: Number(input.quantity), unit: input.unit })),
  };
}

async function loadInputs(plantingIds: string[]): Promise<Map<string, PlantingInput[]>> {
  if (!plantingIds.length) return new Map();
  const rows = await getDb().select().from(plantingInputs).where(inArray(plantingInputs.plantingId, plantingIds));
  const byPlanting = new Map<string, PlantingInput[]>();
  for (const row of rows) {
    const list = byPlanting.get(row.plantingId) ?? [];
    list.push(row);
    byPlanting.set(row.plantingId, list);
  }
  return byPlanting;
}

async function loadPlanting(id: string) {
  const [row] = await getDb().select().from(plantings).where(eq(plantings.id, id)).limit(1);
  return row ?? null;
}

export const plantingRoutes = new Hono()
  .get('/plantings', async (c) => {
    const rows = await getDb().select().from(plantings).orderBy(desc(plantings.plantedAt)).limit(30);
    const inputsByPlanting = await loadInputs(rows.map((row) => row.id));
    const now = new Date();
    return c.json(rows.map((row) => serialize(row, inputsByPlanting.get(row.id) ?? [], now)));
  })
  .post('/plantings', async (c) => {
    const body = validate(plantingSchema, await readJson(c));
    const db = getDb();
    const [installation] = await db.select({ id: mapInstallations.id }).from(mapInstallations)
      .where(and(eq(mapInstallations.kind, 'PLANTACAO'), eq(mapInstallations.active, true))).limit(1);
    if (!installation) return fail('Posicione a Plantação no mapa antes de plantar.', 409, 'PLANTACAO_REQUIRED');
    const [growing] = await db.select({ id: plantings.id }).from(plantings)
      .where(and(eq(plantings.installationId, installation.id), eq(plantings.status, 'GROWING'))).limit(1);
    if (growing) return fail('Já existe um plantio crescendo no talhão. Colha ou cancele antes de plantar de novo.', 409, 'PLANTING_EXISTS');

    const itemIds = body.inputs.map((input) => input.feedItemId);
    const knownItems = await db.select().from(feedItems).where(inArray(feedItems.id, itemIds));
    const knownById = new Map(knownItems.map((item) => [item.id, item]));
    for (const input of body.inputs) {
      const known = knownById.get(input.feedItemId);
      if (!known) return fail('Insumo do depósito não encontrado. Compre na Loja ou cadastre no catálogo.', 404, 'FEED_ITEM_NOT_FOUND');
      if (!known.active) return fail(`O insumo “${known.name}” está inativo no catálogo.`, 409, 'FEED_ITEM_INACTIVE');
    }

    // Uso acima do saldo derivado do Depósito: avisa e pede confirmação
    // explícita — não bloqueia (o histórico de compras pode estar incompleto).
    if (!body.confirmBeyondBalance) {
      const inventory = await loadFeedInventory();
      const beyond = linesBeyondBalance(body.inputs, inventory);
      if (beyond.length) {
        const detail = beyond
          .map((line) => `${knownById.get(line.feedItemId)?.name ?? 'insumo'} (saldo ${line.balance}, uso ${line.quantity})`)
          .join('; ');
        return fail(`Uso acima do saldo do depósito: ${detail}. Compre na Loja ou confirme se o histórico está incompleto.`, 409, 'BEYOND_BALANCE');
      }
    }

    const created = await db.transaction(async (tx) => {
      const [planting] = await tx.insert(plantings).values({
        installationId: installation.id,
        cropName: body.cropName,
        durationHours: body.durationHours.toFixed(3),
        notes: body.notes,
      }).returning();
      const inputs = await tx.insert(plantingInputs).values(body.inputs.map((input) => {
        const item = knownById.get(input.feedItemId)!;
        return {
          plantingId: planting.id,
          feedItemId: input.feedItemId,
          name: item.name,
          quantity: input.quantity.toFixed(3),
          unit: feedUnitSuffix[item.canonicalUnit],
        };
      })).returning();
      return { planting, inputs };
    });
    return c.json(serialize(created.planting, created.inputs, new Date()), 201);
  })
  .post('/plantings/:id/harvest', async (c) => {
    const body = validate(harvestSchema, await readJson(c));
    const db = getDb();
    const current = await loadPlanting(c.req.param('id'));
    if (!current) return fail('Plantio não encontrado.', 404, 'NOT_FOUND');
    if (current.status !== 'GROWING') return fail('Este plantio já foi encerrado.', 409, 'PLANTING_CLOSED');
    const now = new Date();
    if (growthProgress(current.plantedAt, Number(current.durationHours), now) < 1) {
      return fail('A plantação ainda está crescendo — espere o ciclo terminar para colher.', 409, 'PLANTING_NOT_READY');
    }
    const [updated] = await db.update(plantings).set({
      status: 'HARVESTED',
      harvestedAt: now,
      harvestQuantity: body.quantity.toFixed(3),
      harvestUnit: body.unit,
      ...(body.notes !== undefined && body.notes !== null ? { notes: body.notes } : {}),
      updatedAt: now,
    }).where(eq(plantings.id, current.id)).returning();
    const inputsByPlanting = await loadInputs([updated.id]);
    return c.json(serialize(updated, inputsByPlanting.get(updated.id) ?? [], now));
  })
  .post('/plantings/:id/cancel', async (c) => {
    const db = getDb();
    const current = await loadPlanting(c.req.param('id'));
    if (!current) return fail('Plantio não encontrado.', 404, 'NOT_FOUND');
    if (current.status !== 'GROWING') return fail('Este plantio já foi encerrado.', 409, 'PLANTING_CLOSED');
    const now = new Date();
    const [updated] = await db.update(plantings).set({ status: 'CANCELLED', updatedAt: now })
      .where(eq(plantings.id, current.id)).returning();
    const inputsByPlanting = await loadInputs([updated.id]);
    return c.json(serialize(updated, inputsByPlanting.get(updated.id) ?? [], now));
  });
