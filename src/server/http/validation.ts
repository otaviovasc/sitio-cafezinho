import type { Context } from 'hono';
import { z } from 'zod';
import { parseDecimal } from '../../domain/format.js';
import { fail } from './api-error.js';

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return fail('Envie um JSON válido.');
  }
}

export function validate<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'dados'}: ${issue.message}`).join('; '));
  }
  return parsed.data;
}

export const optionalText = z.string().trim().max(2000).nullable().optional().transform((value) => value || null);

export const decimalInput = z.union([z.string(), z.number()]).transform((value, context): number => {
  const parsed = parseDecimal(value);
  if (parsed === null || parsed < 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Use um número maior ou igual a zero.' });
    return 0;
  }
  return parsed;
});
