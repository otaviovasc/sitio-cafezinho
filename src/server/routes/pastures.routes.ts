import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { pastureOccupancies, pastures, mapZones } from '../../db/schema.js';
import { decimalString } from '../../domain/format.js';
import { dateKeyInSaoPaulo } from '../../domain/purchases.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';
import { listPastureOccupancies, listPastureSummaries, moveGroupToPasture, subdividePasture } from '../services/pasture.service.js';

const pastureSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do pasto.').max(120),
  areaHa: decimalInput.nullable().optional().default(null),
});

const pasturePatchSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do pasto.').max(120).optional(),
  areaHa: decimalInput.nullable().optional(),
  active: z.boolean().optional(),
});

const moveSchema = z.object({
  pastureId: z.string().uuid().nullable().default(null),
  movedOn: z.string().date(),
  notes: optionalText,
});

const ringPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Subdivisão guiada: os anéis desenhados no editor viram os novos pastos. */
const subdivideSchema = z.object({
  rings: z.array(z.array(ringPointSchema).min(3).max(500)).min(2).max(8),
});

export const pastureRoutes = new Hono()
  .get('/pastures', async (c) => c.json(await listPastureSummaries(dateKeyInSaoPaulo())))
  .post('/pastures', async (c) => {
    const body = validate(pastureSchema, await readJson(c));
    try {
      const [created] = await getDb().insert(pastures).values({
        name: body.name,
        areaHa: body.areaHa === null ? null : decimalString(body.areaHa),
      }).returning();
      return c.json({ id: created.id, name: created.name, areaHa: created.areaHa, active: created.active, currentOccupancy: null, restDays: null }, 201);
    } catch {
      return fail('Já existe um pasto com este nome.', 409, 'DUPLICATE_PASTURE');
    }
  })
  .patch('/pastures/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(pasturePatchSchema, await readJson(c));
    const db = getDb();
    if (body.active === false) {
      const [open] = await db.select({ id: pastureOccupancies.id }).from(pastureOccupancies)
        .where(and(eq(pastureOccupancies.pastureId, id), isNull(pastureOccupancies.endedOn))).limit(1);
      if (open) return fail('Retire o lote deste pasto antes de desativá-lo.', 409, 'PASTURE_OCCUPIED');
    }
    let updated;
    try {
      updated = await db.transaction(async (tx) => {
        const [previous] = await tx.select({ name: pastures.name }).from(pastures).where(eq(pastures.id, id)).limit(1);
        const [saved] = await tx.update(pastures).set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.areaHa !== undefined ? { areaHa: body.areaHa === null ? null : decimalString(body.areaHa) } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          updatedAt: new Date(),
        }).where(eq(pastures.id, id)).returning();
        // A zona do mapa desenha este pasto: o nome exibido acompanha o rename.
        if (saved && body.name !== undefined && body.name !== previous?.name) {
          await tx.update(mapZones).set({ name: body.name, updatedAt: new Date() })
            .where(and(eq(mapZones.pastureId, id), eq(mapZones.active, true)));
        }
        return saved ?? null;
      });
    } catch {
      return fail('Já existe um pasto com este nome.', 409, 'DUPLICATE_PASTURE');
    }
    if (!updated) return fail('Pasto não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .get('/pastures/:id/occupancies', async (c) => c.json(await listPastureOccupancies(c.req.param('id'))))
  .post('/pastures/:id/subdivide', async (c) => {
    const body = validate(subdivideSchema, await readJson(c));
    const created = await subdividePasture(c.req.param('id'), body.rings);
    return c.json({ created: created.map((pasture) => ({ id: pasture.id, name: pasture.name, areaHa: pasture.areaHa, active: pasture.active })) }, 201);
  })
  .post('/herd-groups/:id/pasture', async (c) => {
    const body = validate(moveSchema, await readJson(c));
    const occupancy = await moveGroupToPasture(c.req.param('id'), body.pastureId, body.movedOn, body.notes);
    return c.json(occupancy);
  });
