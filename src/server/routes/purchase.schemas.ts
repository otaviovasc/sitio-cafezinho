import { z } from 'zod';
import { decimalInput, optionalText } from '../http/validation.js';

export const purchaseSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  purchaseDate: z.string().date(),
  description: z.string().trim().min(1).max(200),
  category: z.enum(['FEED', 'MINERAL_SUPPLEMENT', 'MEDICINE', 'MILKING_AND_HYGIENE', 'MAINTENANCE', 'FUEL', 'ENERGY', 'ANIMAL_PURCHASE', 'OTHER']),
  grossAmount: decimalInput.optional(),
  discountAmount: decimalInput.optional().default(0),
  freightAmount: decimalInput.optional().default(0),
  totalAmount: decimalInput,
  dueDate: z.string().date().nullable().optional(),
  status: z.enum(['OPEN', 'PAID', 'CANCELLED']).optional().default('OPEN'),
  notes: optionalText,
});

export const itemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: decimalInput,
  unit: z.enum(['UNIT', 'KG', 'LITER', 'BAG', 'BOX', 'OTHER']),
  unitPrice: decimalInput,
  totalPrice: decimalInput,
  notes: optionalText,
});
