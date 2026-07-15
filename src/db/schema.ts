import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const animalStatus = pgEnum('animal_status', [
  'HEIFER', 'LACTATING', 'DRY', 'SOLD', 'DEAD',
]);
export const reproductiveEventType = pgEnum('reproductive_event_type', ['HEAT', 'CALVING']);
export const reproductiveOutcome = pgEnum('reproductive_outcome', ['PENDING', 'NOT_PREGNANT', 'PREGNANT']);
export const milkingRoutine = pgEnum('milking_routine', ['MORNING_AND_AFTERNOON', 'MORNING_ONLY', 'NOT_MILKED']);
export const milkInputMode = pgEnum('milk_input_mode', [
  'SEPARATE_MORNING_AFTERNOON', 'COMBINED_TOTAL', 'MIXED',
]);
export const milkSource = pgEnum('milk_source', ['MANUAL', 'CHATGPT_IMPORT', 'NOTEBOOK_SEED']);
export const measurementConfidence = pgEnum('measurement_confidence', ['HIGH', 'MEDIUM', 'LOW']);
export const measurementStatus = pgEnum('measurement_status', ['CONFIRMED', 'NEEDS_REVIEW', 'EXCLUDED']);
export const purchaseCategory = pgEnum('purchase_category', [
  'FEED', 'MINERAL_SUPPLEMENT', 'MEDICINE', 'MILKING_AND_HYGIENE', 'MAINTENANCE',
  'FUEL', 'ENERGY', 'ANIMAL_PURCHASE', 'OTHER',
]);
export const purchaseStatus = pgEnum('purchase_status', ['OPEN', 'PAID', 'CANCELLED']);
export const purchaseUnit = pgEnum('purchase_unit', ['UNIT', 'KG', 'LITER', 'BAG', 'BOX', 'OTHER']);
export const storageProvider = pgEnum('storage_provider', ['LOCAL', 'GOOGLE_DRIVE']);
export const storageStatus = pgEnum('storage_status', ['UPLOADING', 'AVAILABLE', 'FAILED', 'DELETED']);
export const documentType = pgEnum('document_type', [
  'INVOICE', 'BOLETO', 'PAYMENT_RECEIPT', 'MILK_NOTEBOOK', 'OTHER',
]);
export const weightSource = pgEnum('weight_source', ['MANUAL', 'CHATGPT_IMPORT', 'DEMO_SEED']);

export const herdGroups = pgTable('herd_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  milkingRoutine: milkingRoutine('milking_routine').notNull(),
  active: boolean('active').notNull().default(true),
  ...auditColumns,
}, (table) => [uniqueIndex('herd_groups_name_unique').on(table.name)]);

export const animals = pgTable('animals', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  tagNumber: text('tag_number'),
  status: animalStatus('status').notNull().default('HEIFER'),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('animals_tag_number_unique').on(table.tagNumber),
  index('animals_name_idx').on(table.name),
  check('animals_name_or_tag', sql`${table.name} is not null or ${table.tagNumber} is not null`),
]);

export const animalStatusEvents = pgTable('animal_status_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  previousStatus: animalStatus('previous_status'),
  status: animalStatus('status').notNull(),
  changedOn: date('changed_on').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('animal_status_events_animal_date_idx').on(table.animalId, table.changedOn)]);

export const animalReproductiveEvents = pgTable('animal_reproductive_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  statusEventId: uuid('status_event_id').references(() => animalStatusEvents.id, { onDelete: 'cascade' }),
  type: reproductiveEventType('type').notNull(),
  occurredOn: date('occurred_on').notNull(),
  hadBreeding: boolean('had_breeding').notNull().default(false),
  bullName: text('bull_name'),
  outcome: reproductiveOutcome('outcome'),
  outcomeRecordedOn: date('outcome_recorded_on'),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('animal_reproductive_events_animal_date_idx').on(table.animalId, table.occurredOn),
  uniqueIndex('animal_reproductive_events_status_event_unique').on(table.statusEventId).where(sql`${table.statusEventId} is not null`),
  check('animal_reproductive_events_shape', sql`
    (${table.type} = 'CALVING' and ${table.hadBreeding} = false and ${table.bullName} is null and ${table.outcome} is null and ${table.outcomeRecordedOn} is null)
    or
    (${table.type} = 'HEAT' and (
      (${table.hadBreeding} = false and ${table.bullName} is null and ${table.outcome} is null and ${table.outcomeRecordedOn} is null)
      or
      (${table.hadBreeding} = true and ${table.outcome} is not null)
    ))
  `),
  check('animal_reproductive_events_outcome_date', sql`${table.outcomeRecordedOn} is null or ${table.outcomeRecordedOn} >= ${table.occurredOn}`),
]);

export const animalAliases = pgTable('animal_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  normalizedAlias: text('normalized_alias').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('animal_aliases_animal_normalized_unique').on(table.animalId, table.normalizedAlias),
  index('animal_aliases_normalized_idx').on(table.normalizedAlias),
]);

export const animalGroupAssignments = pgTable('animal_group_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => herdGroups.id, { onDelete: 'restrict' }),
  startedOn: date('started_on').notNull(),
  endedOn: date('ended_on'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('animal_group_assignments_animal_date_idx').on(table.animalId, table.startedOn),
  uniqueIndex('animal_group_assignments_current_unique').on(table.animalId).where(sql`${table.endedOn} is null`),
  check('animal_group_assignment_dates', sql`${table.endedOn} is null or ${table.endedOn} >= ${table.startedOn}`),
]);

export const weightSessions = pgTable('weight_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  measuredOn: date('measured_on').notNull(),
  title: text('title'),
  source: weightSource('source').notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [uniqueIndex('weight_sessions_date_unique').on(table.measuredOn)]);

export const animalWeights = pgTable('animal_weights', {
  id: uuid('id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').references(() => animals.id, { onDelete: 'set null' }),
  weightSessionId: uuid('weight_session_id').references(() => weightSessions.id, { onDelete: 'cascade' }),
  measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
  rawAnimalLabel: text('raw_animal_label'),
  rawValueText: text('raw_value_text'),
  weightKg: numeric('weight_kg', { precision: 10, scale: 2 }),
  confidence: measurementConfidence('confidence').notNull().default('HIGH'),
  status: measurementStatus('status').notNull().default('CONFIRMED'),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('animal_weights_animal_date_idx').on(table.animalId, table.measuredAt),
  index('animal_weights_session_idx').on(table.weightSessionId),
  uniqueIndex('animal_weights_session_animal_unique').on(table.weightSessionId, table.animalId).where(sql`${table.animalId} is not null`),
  check('animal_weights_positive', sql`${table.weightKg} is null or ${table.weightKg} > 0`),
]);

export const milkSessions = pgTable('milk_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionDate: date('session_date').notNull(),
  title: text('title'),
  inputMode: milkInputMode('input_mode').notNull(),
  source: milkSource('source').notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [index('milk_sessions_date_idx').on(table.sessionDate)]);

export const milkMeasurements = pgTable('milk_measurements', {
  id: uuid('id').primaryKey().defaultRandom(),
  milkSessionId: uuid('milk_session_id').notNull().references(() => milkSessions.id, { onDelete: 'cascade' }),
  animalId: uuid('animal_id').references(() => animals.id, { onDelete: 'set null' }),
  rawAnimalLabel: text('raw_animal_label').notNull(),
  rawValueText: text('raw_value_text'),
  morningLiters: numeric('morning_liters', { precision: 10, scale: 2 }),
  afternoonLiters: numeric('afternoon_liters', { precision: 10, scale: 2 }),
  totalLiters: numeric('total_liters', { precision: 10, scale: 2 }).notNull(),
  confidence: measurementConfidence('confidence').notNull(),
  status: measurementStatus('status').notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('milk_measurements_session_idx').on(table.milkSessionId),
  index('milk_measurements_animal_idx').on(table.animalId),
  check('milk_measurements_non_negative', sql`
    ${table.totalLiters} >= 0 and
    (${table.morningLiters} is null or ${table.morningLiters} >= 0) and
    (${table.afternoonLiters} is null or ${table.afternoonLiters} >= 0)
  `),
]);

export const dailyMilkTotals = pgTable('daily_milk_totals', {
  id: uuid('id').primaryKey().defaultRandom(),
  productionDate: date('production_date').notNull(),
  morningLiters: numeric('morning_liters', { precision: 12, scale: 2 }),
  afternoonLiters: numeric('afternoon_liters', { precision: 12, scale: 2 }),
  totalLiters: numeric('total_liters', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('daily_milk_totals_date_unique').on(table.productionDate),
  check('daily_milk_totals_non_negative', sql`
    ${table.totalLiters} >= 0 and
    (${table.morningLiters} is null or ${table.morningLiters} >= 0) and
    (${table.afternoonLiters} is null or ${table.afternoonLiters} >= 0)
  `),
  check('daily_milk_totals_periods', sql`
    (${table.morningLiters} is null and ${table.afternoonLiters} is null)
    or
    (${table.morningLiters} is not null and ${table.afternoonLiters} is not null and ${table.totalLiters} = ${table.morningLiters} + ${table.afternoonLiters})
  `),
]);

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [index('suppliers_name_idx').on(table.name)]);

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  purchaseDate: date('purchase_date').notNull(),
  description: text('description').notNull(),
  category: purchaseCategory('category').notNull(),
  grossAmount: numeric('gross_amount', { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  freightAmount: numeric('freight_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  dueDate: date('due_date'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  status: purchaseStatus('status').notNull().default('OPEN'),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('purchases_date_idx').on(table.purchaseDate),
  index('purchases_due_idx').on(table.dueDate),
  check('purchases_non_negative', sql`
    ${table.grossAmount} >= 0 and ${table.discountAmount} >= 0 and
    ${table.freightAmount} >= 0 and ${table.totalAmount} >= 0
  `),
]);

export const purchaseItems = pgTable('purchase_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseId: uuid('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unit: purchaseUnit('unit').notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric('total_price', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
}, (table) => [
  index('purchase_items_purchase_idx').on(table.purchaseId),
  check('purchase_items_non_negative', sql`
    ${table.quantity} >= 0 and ${table.unitPrice} >= 0 and ${table.totalPrice} >= 0
  `),
]);

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  sha256: text('sha256').notNull(),
  storageProvider: storageProvider('storage_provider').notNull(),
  storageFileId: text('storage_file_id').notNull(),
  storageFolderId: text('storage_folder_id'),
  storageStatus: storageStatus('storage_status').notNull(),
  documentType: documentType('document_type').notNull(),
  purchaseId: uuid('purchase_id').references(() => purchases.id, { onDelete: 'set null' }),
  milkSessionId: uuid('milk_session_id').references(() => milkSessions.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('attachments_sha_idx').on(table.sha256),
  index('attachments_purchase_idx').on(table.purchaseId),
  index('attachments_session_idx').on(table.milkSessionId),
  check('attachments_single_parent', sql`not (${table.purchaseId} is not null and ${table.milkSessionId} is not null)`),
]);

export type Animal = typeof animals.$inferSelect;
export type HerdGroup = typeof herdGroups.$inferSelect;
export type WeightSession = typeof weightSessions.$inferSelect;
export type MilkMeasurement = typeof milkMeasurements.$inferSelect;
export type DailyMilkTotal = typeof dailyMilkTotals.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
