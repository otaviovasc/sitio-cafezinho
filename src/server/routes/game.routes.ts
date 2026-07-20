import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animalGroupAssignments, animals, dailyMilkTotals, mapInstallations, mapZones, herdGroups, milkCollections, monthlyMilkPrices, pastureOccupancies, pastures, plantingInputs, plantings, purchases, type MapZone, type MapInstallation } from '../../db/schema.js';
import { resolveDailyMilkDay } from '../../domain/daily-milk.js';
import { summarizeGameEconomy } from '../../domain/game/economy.js';
import { pointInPolygon, ringError } from '../../domain/game/geometry.js';
import { growthProgress, growthStage, plantingReadyAt } from '../../domain/game/planting.js';
import { buildHerdState, type GameMapInstallation, type GameMapState, type GameMapZone, type GamePlanting, type GameState, type MapPoint } from '../../domain/game/state.js';
import { computeStreak } from '../../domain/game/streaks.js';
import { tankLevel } from '../../domain/game/tank.js';
import { dateKeyInSaoPaulo } from '../../domain/purchases.js';
import { fail } from '../http/api-error.js';
import { readJson, validate } from '../http/validation.js';
import { syncPastureAreaFromRing } from '../services/pasture.service.js';

/**
 * Rotas do jogo. O mapa (zonas/instalações) é configuração de exibição com
 * CRUD próprio; o estado agregado sai em /game/state. Fatos de fazenda nunca
 * são escritos por aqui — as ações do jogo usam os endpoints validados
 * existentes (regra de ouro em docs/game-design.md). Exceção deliberada: ao
 * salvar uma zona de pasto, a área medida pelo traçado é gravada no pasto via
 * pasture.service (o traçado é a medição oficial dos hectares).
 */

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const zoneSchema = z.object({
  kind: z.enum(['PERIMETER', 'PASTURE']),
  name: z.string().trim().min(1, 'Dê um nome para a área.').max(120),
  pastureId: z.string().uuid().nullable().optional().default(null),
  ring: z.array(pointSchema).min(3, 'Trace pelo menos 3 pontos.').max(500),
});

const zonePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  pastureId: z.string().uuid().nullable().optional(),
  ring: z.array(pointSchema).min(3).max(500).optional(),
});

const installationSchema = z.object({
  kind: z.enum(['MANGUEIRA', 'DEPOSITO', 'GARAGEM', 'CASA', 'ESTACAO_ALIMENTACAO', 'PLANTACAO']),
  name: z.string().trim().min(1).max(120),
  position: pointSchema,
});

const installationPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  position: pointSchema.optional(),
});

function toZone(row: MapZone, herdGroupId: string | null = null): GameMapZone {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    pastureId: row.pastureId,
    herdGroupId,
    ring: row.ring as MapPoint[],
    styleVariant: row.styleVariant,
  };
}

function toInstallation(row: MapInstallation): GameMapInstallation {
  return { id: row.id, kind: row.kind, name: row.name, position: row.position as MapPoint };
}

/** Lote atual por pasto: derivado da ocupação aberta (pasture_occupancies), fonte única. */
async function openGroupByPasture(): Promise<Map<string, string>> {
  const rows = await getDb().select({
    pastureId: pastureOccupancies.pastureId,
    herdGroupId: pastureOccupancies.herdGroupId,
  }).from(pastureOccupancies).where(isNull(pastureOccupancies.endedOn));
  return new Map(rows.map((row) => [row.pastureId, row.herdGroupId]));
}

async function loadMapState(): Promise<GameMapState> {
  const db = getDb();
  const [zoneRows, installationRows, groupByPasture] = await Promise.all([
    db.select().from(mapZones).where(eq(mapZones.active, true)).orderBy(asc(mapZones.createdAt)),
    db.select().from(mapInstallations).where(eq(mapInstallations.active, true)).orderBy(asc(mapInstallations.createdAt)),
    openGroupByPasture(),
  ]);
  return {
    zones: zoneRows.map((row) => toZone(row, row.pastureId ? groupByPasture.get(row.pastureId) ?? null : null)),
    installations: installationRows.map(toInstallation),
  };
}

async function activePerimeter() {
  const [row] = await getDb().select().from(mapZones)
    .where(and(eq(mapZones.kind, 'PERIMETER'), eq(mapZones.active, true))).limit(1);
  return row ?? null;
}

/** Contenção no perímetro: pastos e instalações não existem fora do sítio. */
function insidePerimeter(perimeterRing: MapPoint[], point: MapPoint): boolean {
  return pointInPolygon({ x: point.lng, y: point.lat }, perimeterRing.map((vertex) => ({ x: vertex.lng, y: vertex.lat })));
}

function ringInsidePerimeter(perimeterRing: MapPoint[], ring: MapPoint[]): boolean {
  return ring.every((point) => insidePerimeter(perimeterRing, point));
}

/** Plantio GROWING no talhão, com insumos e progresso derivado do relógio. */
async function loadActivePlanting(now: Date): Promise<GamePlanting | null> {
  const db = getDb();
  const [row] = await db.select().from(plantings).where(eq(plantings.status, 'GROWING')).limit(1);
  if (!row) return null;
  const inputRows = await db.select().from(plantingInputs).where(eq(plantingInputs.plantingId, row.id));
  const durationHours = Number(row.durationHours);
  const progress = growthProgress(row.plantedAt, durationHours, now);
  return {
    id: row.id,
    installationId: row.installationId,
    cropName: row.cropName,
    plantedAt: row.plantedAt.toISOString(),
    durationHours,
    readyAt: plantingReadyAt(row.plantedAt, durationHours).toISOString(),
    progress,
    stage: growthStage(progress),
    inputs: inputRows.map((input) => ({ name: input.name, quantity: Number(input.quantity), unit: input.unit })),
  };
}

async function assertPastureLinkable(pastureId: string, exceptZoneId?: string) {
  const db = getDb();
  const [pasture] = await db.select({ id: pastures.id }).from(pastures).where(eq(pastures.id, pastureId)).limit(1);
  if (!pasture) fail('Pasto não encontrado.', 404, 'PASTURE_NOT_FOUND');
  const conditions = [eq(mapZones.pastureId, pastureId), eq(mapZones.active, true)];
  if (exceptZoneId) conditions.push(ne(mapZones.id, exceptZoneId));
  const [taken] = await db.select({ id: mapZones.id }).from(mapZones).where(and(...conditions)).limit(1);
  if (taken) fail('Este pasto já está desenhado em outra área do mapa.', 409, 'PASTURE_ZONE_EXISTS');
}

export const gameRoutes = new Hono()
  .get('/game/state', async (c) => {
    c.header('cache-control', 'no-store');
    const db = getDb();
    const [map, planting, animalRows, assignmentRows, groupRows, dailyRows, collectionRows, priceRows, purchaseRows] = await Promise.all([
      loadMapState(),
      loadActivePlanting(new Date()),
      db.select({ id: animals.id, status: animals.status }).from(animals),
      db.select({ animalId: animalGroupAssignments.animalId, groupId: animalGroupAssignments.groupId })
        .from(animalGroupAssignments).where(isNull(animalGroupAssignments.endedOn)),
      db.select({ id: herdGroups.id, name: herdGroups.name, active: herdGroups.active }).from(herdGroups),
      db.select().from(dailyMilkTotals),
      db.select({ collectionDate: milkCollections.collectionDate, liters: milkCollections.liters }).from(milkCollections),
      db.select({ month: monthlyMilkPrices.month, pricePerLiter: monthlyMilkPrices.pricePerLiter }).from(monthlyMilkPrices),
      db.select({ purchaseDate: purchases.purchaseDate, status: purchases.status, totalAmount: purchases.totalAmount }).from(purchases),
    ]);
    const { herd, unassignedCount } = buildHerdState(animalRows, assignmentRows, groupRows, map.zones);

    const today = dateKeyInSaoPaulo();
    const month = today.slice(0, 7);
    const todayProduction = resolveDailyMilkDay(dailyRows, today);
    const producedLiters = todayProduction ? Number(todayProduction.totalLiters) : null;
    const todayCollections = collectionRows.filter((row) => row.collectionDate === today);
    const collectedLiters = Math.round(todayCollections.reduce((sum, row) => sum + Number(row.liters), 0) * 100) / 100;

    const monthPrice = priceRows.find((row) => row.month.startsWith(month)) ?? null;
    const economy = summarizeGameEconomy(collectionRows, monthPrice?.pricePerLiter ?? null, purchaseRows, month);

    const streaks = {
      dailyMilk: computeStreak(dailyRows.map((row) => row.productionDate), today),
      collections: computeStreak(collectionRows.map((row) => row.collectionDate), today),
    };

    const state: GameState = {
      map,
      herd,
      unassignedCount,
      today: {
        date: today,
        producedLiters,
        collectedLiters,
        collectionCount: todayCollections.length,
        hasDailyTotal: todayProduction !== null,
        tankLevel: tankLevel(producedLiters, collectedLiters),
      },
      economy,
      streaks,
      planting,
    };
    return c.json(state);
  })
  .get('/game/map', async (c) => c.json(await loadMapState()))
  .post('/game/map/zones', async (c) => {
    const body = validate(zoneSchema, await readJson(c));
    const invalidRing = ringError(body.ring);
    if (invalidRing) return fail(invalidRing, 400, 'INVALID_RING');
    const db = getDb();
    if (body.kind === 'PERIMETER') {
      if (body.pastureId) return fail('O perímetro não se vincula a um pasto.', 400, 'PERIMETER_UNLINKED');
      if (await activePerimeter()) return fail('O sítio já tem um perímetro traçado. Edite ou exclua o atual.', 409, 'PERIMETER_EXISTS');
    } else {
      const perimeter = await activePerimeter();
      if (!perimeter) return fail('Trace o perímetro do sítio antes dos pastos.', 409, 'PERIMETER_REQUIRED');
      if (!ringInsidePerimeter(perimeter.ring as MapPoint[], body.ring)) {
        return fail('O pasto precisa ficar inteiro dentro do perímetro do sítio.', 400, 'PASTURE_OUTSIDE_PERIMETER');
      }
      if (body.pastureId) {
        await assertPastureLinkable(body.pastureId);
        // O traçado é a medição oficial da área do pasto (hectares).
        await syncPastureAreaFromRing(body.pastureId, body.ring);
      }
    }
    // Patchwork: a variação de verde é atribuída ciclicamente pelo servidor.
    const pastureZones = await db.select({ id: mapZones.id }).from(mapZones)
      .where(and(eq(mapZones.kind, 'PASTURE'), eq(mapZones.active, true)));
    const styleVariant = body.kind === 'PASTURE' ? pastureZones.length % 3 : 0;
    const [created] = await db.insert(mapZones).values({
      kind: body.kind,
      name: body.name,
      pastureId: body.kind === 'PASTURE' ? body.pastureId : null,
      ring: body.ring,
      styleVariant,
    }).returning();
    const groupByPasture = created.pastureId ? await openGroupByPasture() : new Map<string, string>();
    return c.json(toZone(created, created.pastureId ? groupByPasture.get(created.pastureId) ?? null : null), 201);
  })
  .patch('/game/map/zones/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(zonePatchSchema, await readJson(c));
    const db = getDb();
    const [current] = await db.select().from(mapZones).where(eq(mapZones.id, id)).limit(1);
    if (!current || !current.active) return fail('Área não encontrada.', 404, 'NOT_FOUND');
    if (body.ring) {
      const invalidRing = ringError(body.ring);
      if (invalidRing) return fail(invalidRing, 400, 'INVALID_RING');
      if (current.kind === 'PASTURE') {
        const perimeter = await activePerimeter();
        if (perimeter && !ringInsidePerimeter(perimeter.ring as MapPoint[], body.ring)) {
          return fail('O pasto precisa ficar inteiro dentro do perímetro do sítio.', 400, 'PASTURE_OUTSIDE_PERIMETER');
        }
      }
    }
    if (body.pastureId !== undefined && body.pastureId !== null) {
      if (current.kind === 'PERIMETER') return fail('O perímetro não se vincula a um pasto.', 400, 'PERIMETER_UNLINKED');
      await assertPastureLinkable(body.pastureId, id);
    }
    const [updated] = await db.update(mapZones).set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.pastureId !== undefined ? { pastureId: body.pastureId } : {}),
      ...(body.ring !== undefined ? { ring: body.ring } : {}),
      updatedAt: new Date(),
    }).where(eq(mapZones.id, id)).returning();
    if (updated.kind === 'PASTURE' && updated.pastureId && (body.ring !== undefined || body.pastureId)) {
      await syncPastureAreaFromRing(updated.pastureId, updated.ring as MapPoint[]);
    }
    const groupByPasture = updated.pastureId ? await openGroupByPasture() : new Map<string, string>();
    return c.json(toZone(updated, updated.pastureId ? groupByPasture.get(updated.pastureId) ?? null : null));
  })
  .delete('/game/map/zones/:id', async (c) => {
    const db = getDb();
    const [current] = await db.select().from(mapZones).where(eq(mapZones.id, c.req.param('id'))).limit(1);
    if (!current || !current.active) return fail('Área não encontrada.', 404, 'NOT_FOUND');
    if (current.kind === 'PERIMETER') {
      const [pasture] = await db.select({ id: mapZones.id }).from(mapZones)
        .where(and(eq(mapZones.kind, 'PASTURE'), eq(mapZones.active, true))).limit(1);
      if (pasture) return fail('Exclua os pastos antes de excluir o perímetro.', 409, 'PASTURES_EXIST');
    }
    await db.delete(mapZones).where(eq(mapZones.id, current.id));
    return c.json({ deleted: true });
  })
  .post('/game/map/installations', async (c) => {
    const body = validate(installationSchema, await readJson(c));
    const db = getDb();
    const perimeter = await activePerimeter();
    if (!perimeter) return fail('Trace o perímetro do sítio antes das instalações.', 409, 'PERIMETER_REQUIRED');
    if (!insidePerimeter(perimeter.ring as MapPoint[], body.position)) {
      return fail('A instalação precisa ficar dentro do perímetro do sítio.', 400, 'INSTALLATION_OUTSIDE_PERIMETER');
    }
    const [existing] = await db.select({ id: mapInstallations.id }).from(mapInstallations)
      .where(and(eq(mapInstallations.kind, body.kind), eq(mapInstallations.active, true))).limit(1);
    if (existing) return fail('Esta instalação já está no mapa. Edite a posição dela.', 409, 'INSTALLATION_EXISTS');
    const [created] = await db.insert(mapInstallations).values(body).returning();
    return c.json(toInstallation(created), 201);
  })
  .patch('/game/map/installations/:id', async (c) => {
    const body = validate(installationPatchSchema, await readJson(c));
    const db = getDb();
    const [current] = await db.select().from(mapInstallations).where(eq(mapInstallations.id, c.req.param('id'))).limit(1);
    if (!current || !current.active) return fail('Instalação não encontrada.', 404, 'NOT_FOUND');
    if (body.position) {
      const perimeter = await activePerimeter();
      if (perimeter && !insidePerimeter(perimeter.ring as MapPoint[], body.position)) {
        return fail('A instalação precisa ficar dentro do perímetro do sítio.', 400, 'INSTALLATION_OUTSIDE_PERIMETER');
      }
    }
    const [updated] = await db.update(mapInstallations).set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      updatedAt: new Date(),
    }).where(eq(mapInstallations.id, current.id)).returning();
    return c.json(toInstallation(updated));
  })
  .delete('/game/map/installations/:id', async (c) => {
    const [removed] = await getDb().delete(mapInstallations)
      .where(eq(mapInstallations.id, c.req.param('id'))).returning();
    if (!removed) return fail('Instalação não encontrada.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
