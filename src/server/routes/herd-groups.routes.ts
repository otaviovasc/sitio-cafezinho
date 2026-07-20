import { and, asc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animalGroupAssignments, herdGroups } from '../../db/schema.js';
import { fail } from '../http/api-error.js';
import { readJson, validate } from '../http/validation.js';

const routineSchema = z.enum(['MORNING_AND_AFTERNOON', 'MORNING_ONLY', 'NOT_MILKED']);
const groupSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do grupo.').max(80),
  milkingRoutine: routineSchema,
  active: z.boolean().default(true),
});

export const herdGroupRoutes = new Hono()
  .get('/herd-groups', async (c) => {
    const groups = await getDb().select().from(herdGroups).orderBy(asc(herdGroups.name));
    const assignments = await getDb().select({
      animalId: animalGroupAssignments.animalId,
      groupId: animalGroupAssignments.groupId,
    }).from(animalGroupAssignments).where(isNull(animalGroupAssignments.endedOn));
    return c.json(groups.map((group) => ({
      ...group,
      animalCount: assignments.filter((assignment) => assignment.groupId === group.id).length,
    })));
  })
  .post('/herd-groups', async (c) => {
    const body = validate(groupSchema, await readJson(c));
    try {
      const [created] = await getDb().insert(herdGroups).values(body).returning();
      return c.json({ ...created, animalCount: 0 }, 201);
    } catch {
      return fail('Já existe um grupo com este nome.', 409, 'DUPLICATE_GROUP');
    }
  })
  .patch('/herd-groups/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(groupSchema, await readJson(c));
    if (!body.active) {
      const [currentAnimal] = await getDb().select({ animalId: animalGroupAssignments.animalId })
        .from(animalGroupAssignments).where(and(eq(animalGroupAssignments.groupId, id), isNull(animalGroupAssignments.endedOn))).limit(1);
      if (currentAnimal) return fail('Mova os animais para outro grupo antes de arquivar este.', 409, 'GROUP_HAS_ANIMALS');
    }
    let updated;
    try {
      [updated] = await getDb().update(herdGroups).set({ ...body, updatedAt: new Date() }).where(eq(herdGroups.id, id)).returning();
    } catch {
      return fail('Já existe um grupo com este nome.', 409, 'DUPLICATE_GROUP');
    }
    if (!updated) return fail('Grupo não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  });
