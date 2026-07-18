import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
export const milkSource = pgEnum('milk_source', ['MANUAL', 'IMPORT', 'NOTEBOOK_SEED']);
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
export const weightSource = pgEnum('weight_source', ['MANUAL', 'IMPORT', 'DEMO_SEED']);
export const milkCollectionSource = pgEnum('milk_collection_source', ['DRIVER_READING', 'TANK_READING', 'RECEIPT', 'OTHER']);
export const mastitisQuarter = pgEnum('mastitis_quarter', ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT', 'MULTIPLE', 'UNKNOWN']);
export const mastitisDetectionMethod = pgEnum('mastitis_detection_method', ['VISUAL', 'BLACK_PLATE', 'CMT', 'VETERINARY', 'OTHER', 'UNKNOWN']);
export const mastitisStatus = pgEnum('mastitis_status', ['OBSERVATION', 'IN_TREATMENT', 'WITHDRAWAL_PERIOD', 'RESOLVED', 'RECURRENT', 'NO_IMPROVEMENT', 'CANCELLED']);
export const mastitisOutcome = pgEnum('mastitis_outcome', ['RESOLVED', 'IMPROVED', 'RECURRENT', 'NO_IMPROVEMENT', 'ANIMAL_CULLED', 'UNKNOWN']);
export const revenueCategory = pgEnum('revenue_category', ['MILK_SALE', 'CALF_SALE', 'CULL_SALE', 'ANIMAL_SALE', 'OTHER']);
export const revenueStatus = pgEnum('revenue_status', ['EXPECTED', 'RECEIVED', 'CANCELLED']);
export const animalExitType = pgEnum('animal_exit_type', ['CALF_SALE', 'BREEDING_SALE', 'PRODUCTIVE_CULL', 'HEALTH_CULL', 'MEAT_SALE', 'OTHER']);

// Camada de linguagem natural: uma captura (áudio/documento/texto) vira uma ou
// mais ações propostas que passam pela revisão antes de virar fato.
export const captureInputKind = pgEnum('capture_input_kind', ['AUDIO', 'DOCUMENT', 'TEXT']);
export const captureStatus = pgEnum('capture_status', ['PROCESSING', 'NEEDS_REVIEW', 'REVIEWED', 'FAILED', 'DISMISSED']);
export const proposedActionType = pgEnum('proposed_action_type', [
  'DAILY_MILK_TOTAL', 'INDIVIDUAL_MILK_SESSION', 'MILK_COLLECTION', 'MASTITIS_CASE',
  'PURCHASE', 'REVENUE', 'WEIGHT_SESSION', 'FEED_PURCHASE', 'FEEDING_EVENT', 'UNKNOWN',
]);
export const proposedActionCommitStatus = pgEnum('proposed_action_commit_status', ['READY', 'NEEDS_REVIEW', 'NEEDS_PERIOD', 'UNREPRESENTABLE']);
export const proposedActionStatus = pgEnum('proposed_action_status', ['NEEDS_REVIEW', 'CONFIRMED', 'DISMISSED', 'FAILED']);

// Camada de jogo (/jogo): o mapa é configuração de exibição — polígonos em
// lat/lng traçados uma vez sobre satélite. Não é fato de fazenda; o vínculo
// zona↔lote apenas diz ONDE desenhar o lote no tabuleiro.
export const mapZoneKind = pgEnum('map_zone_kind', ['PERIMETER', 'PASTURE']);
export const mapInstallationKind = pgEnum('map_installation_kind', ['MANGUEIRA', 'DEPOSITO', 'GARAGEM', 'CASA', 'ESTACAO_ALIMENTACAO', 'PLANTACAO']);

// Plantação: ciclo real de roça (plantio com insumos → crescimento por relógio
// → colheita). O progresso nunca é armazenado — deriva de planted_at +
// duration_hours (src/domain/game/planting.ts).
export const plantingStatus = pgEnum('planting_status', ['GROWING', 'HARVESTED', 'CANCELLED']);

// Inventário de alimentação: um item só entra no estoque por compra registrada
// (feed_purchase_entries credita; feeding_event_items debita). O saldo é
// sempre DERIVADO (comprado − consumido), nunca armazenado — anti-inferência.
export const feedUnit = pgEnum('feed_unit', ['KG', 'LITER', 'UNIT']);
export const feedingContext = pgEnum('feeding_context', ['MILKING', 'PASTURE', 'STATION']);

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
  totalLiters: numeric('total_liters', { precision: 10, scale: 2 }),
  confidence: measurementConfidence('confidence').notNull(),
  status: measurementStatus('status').notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('milk_measurements_session_idx').on(table.milkSessionId),
  index('milk_measurements_animal_idx').on(table.animalId),
  check('milk_measurements_non_negative', sql`
    (${table.totalLiters} is null or ${table.totalLiters} >= 0) and
    (${table.morningLiters} is null or ${table.morningLiters} >= 0) and
    (${table.afternoonLiters} is null or ${table.afternoonLiters} >= 0)
  `),
]);

export const dailyMilkTotals = pgTable('daily_milk_totals', {
  id: uuid('id').primaryKey().defaultRandom(),
  productionDate: date('production_date').notNull(),
  herdGroupId: uuid('herd_group_id').references(() => herdGroups.id, { onDelete: 'restrict' }),
  morningLiters: numeric('morning_liters', { precision: 12, scale: 2 }),
  afternoonLiters: numeric('afternoon_liters', { precision: 12, scale: 2 }),
  totalLiters: numeric('total_liters', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('daily_milk_totals_date_overall_unique').on(table.productionDate).where(sql`${table.herdGroupId} is null`),
  uniqueIndex('daily_milk_totals_date_group_unique').on(table.productionDate, table.herdGroupId).where(sql`${table.herdGroupId} is not null`),
  index('daily_milk_totals_group_idx').on(table.herdGroupId),
  check('daily_milk_totals_non_negative', sql`
    ${table.totalLiters} >= 0 and
    (${table.morningLiters} is null or ${table.morningLiters} >= 0) and
    (${table.afternoonLiters} is null or ${table.afternoonLiters} >= 0)
  `),
  check('daily_milk_totals_periods', sql`
    (${table.morningLiters} is null and ${table.afternoonLiters} is null)
    or
    (${table.morningLiters} is not null and ${table.afternoonLiters} is null and ${table.totalLiters} = ${table.morningLiters})
    or
    (${table.morningLiters} is null and ${table.afternoonLiters} is not null and ${table.totalLiters} = ${table.afternoonLiters})
    or
    (${table.morningLiters} is not null and ${table.afternoonLiters} is not null and ${table.totalLiters} = ${table.morningLiters} + ${table.afternoonLiters})
  `),
]);

export const milkCollections = pgTable('milk_collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionDate: date('collection_date').notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }),
  liters: numeric('liters', { precision: 12, scale: 2 }).notNull(),
  source: milkCollectionSource('source').notNull().default('TANK_READING'),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('milk_collections_date_idx').on(table.collectionDate),
  check('milk_collections_positive', sql`${table.liters} > 0`),
]);

export const monthlyMilkPrices = pgTable('monthly_milk_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  month: date('month').notNull(),
  pricePerLiter: numeric('price_per_liter', { precision: 12, scale: 4 }).notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('monthly_milk_prices_month_unique').on(table.month),
  check('monthly_milk_prices_first_day', sql`extract(day from ${table.month}) = 1`),
  check('monthly_milk_prices_positive', sql`${table.pricePerLiter} > 0`),
]);

export const mastitisCases = pgTable('mastitis_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
  affectedQuarter: mastitisQuarter('affected_quarter'),
  detectionMethod: mastitisDetectionMethod('detection_method'),
  observedSigns: text('observed_signs'),
  status: mastitisStatus('status').notNull().default('OBSERVATION'),
  treatmentSummary: text('treatment_summary'),
  treatmentStartedAt: timestamp('treatment_started_at', { withTimezone: true }),
  treatmentExpectedEndAt: timestamp('treatment_expected_end_at', { withTimezone: true }),
  withdrawalEndsAt: date('withdrawal_ends_at'),
  milkDiscardRequired: boolean('milk_discard_required').notNull().default(false),
  outcome: mastitisOutcome('outcome'),
  notes: text('notes'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  ...auditColumns,
}, (table) => [
  index('mastitis_cases_animal_date_idx').on(table.animalId, table.detectedAt),
  index('mastitis_cases_status_idx').on(table.status),
]);

export const mastitisActions = pgTable('mastitis_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  mastitisCaseId: uuid('mastitis_case_id').notNull().references(() => mastitisCases.id, { onDelete: 'cascade' }),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  actionDescription: text('action_description').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completionNotes: text('completion_notes'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  ...auditColumns,
}, (table) => [index('mastitis_actions_case_schedule_idx').on(table.mastitisCaseId, table.scheduledFor)]);

export const revenues = pgTable('revenues', {
  id: uuid('id').primaryKey().defaultRandom(),
  revenueDate: date('revenue_date').notNull(),
  category: revenueCategory('category').notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  status: revenueStatus('status').notNull().default('EXPECTED'),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  animalId: uuid('animal_id').references(() => animals.id, { onDelete: 'set null' }),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  quantity: numeric('quantity', { precision: 14, scale: 3 }),
  unitPrice: numeric('unit_price', { precision: 12, scale: 4 }),
  bonusAmount: numeric('bonus_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  buyerName: text('buyer_name'),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('revenues_date_idx').on(table.revenueDate),
  index('revenues_animal_idx').on(table.animalId),
  check('revenues_positive_amount', sql`${table.amount} > 0`),
  check('revenues_non_negative_details', sql`
    (${table.quantity} is null or ${table.quantity} > 0) and
    (${table.unitPrice} is null or ${table.unitPrice} >= 0) and
    ${table.bonusAmount} >= 0 and ${table.discountAmount} >= 0
  `),
  check('revenues_period', sql`${table.periodEnd} is null or ${table.periodStart} is null or ${table.periodEnd} >= ${table.periodStart}`),
]);

export const animalExits = pgTable('animal_exits', {
  id: uuid('id').primaryKey().defaultRandom(),
  animalId: uuid('animal_id').notNull().references(() => animals.id, { onDelete: 'cascade' }),
  statusEventId: uuid('status_event_id').notNull().references(() => animalStatusEvents.id, { onDelete: 'cascade' }),
  exitType: animalExitType('exit_type'),
  reason: text('reason'),
  buyerName: text('buyer_name'),
  weightKg: numeric('weight_kg', { precision: 10, scale: 2 }),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  revenueId: uuid('revenue_id').references(() => revenues.id, { onDelete: 'set null' }),
  revenueCreatedHere: boolean('revenue_created_here').notNull().default(false),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('animal_exits_status_event_unique').on(table.statusEventId),
  index('animal_exits_animal_idx').on(table.animalId),
  check('animal_exits_positive_weight', sql`${table.weightKg} is null or ${table.weightKg} > 0`),
  check('animal_exits_positive_amount', sql`${table.amount} is null or ${table.amount} > 0`),
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
  milkCollectionId: uuid('milk_collection_id').references(() => milkCollections.id, { onDelete: 'set null' }),
  revenueId: uuid('revenue_id').references(() => revenues.id, { onDelete: 'set null' }),
  animalExitId: uuid('animal_exit_id').references(() => animalExits.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('attachments_sha_idx').on(table.sha256),
  index('attachments_purchase_idx').on(table.purchaseId),
  index('attachments_session_idx').on(table.milkSessionId),
  index('attachments_collection_idx').on(table.milkCollectionId),
  index('attachments_revenue_idx').on(table.revenueId),
  index('attachments_exit_idx').on(table.animalExitId),
  check('attachments_single_parent', sql`num_nonnulls(${table.purchaseId}, ${table.milkSessionId}, ${table.milkCollectionId}, ${table.revenueId}, ${table.animalExitId}) <= 1`),
]);

// Uma captura por evento de entrada. Guardamos todos os artefatos de texto
// (transcrição, JSON bruto do modelo, resumo de OCR e metadados) para auditar e
// reprocessar; o áudio em si é processado em memória e descartado.
export const captures = pgTable('captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  inputKind: captureInputKind('input_kind').notNull(),
  status: captureStatus('status').notNull().default('PROCESSING'),
  transcript: text('transcript'),
  sttRaw: jsonb('stt_raw'),
  ocrSummary: text('ocr_summary'),
  interpretRaw: jsonb('interpret_raw'),
  documentAttachmentId: uuid('document_attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
  sttModel: text('stt_model'),
  interpretModel: text('interpret_model'),
  tokensUsed: integer('tokens_used'),
  costCents: numeric('cost_cents', { precision: 12, scale: 4 }),
  latencyMs: integer('latency_ms'),
  error: text('error'),
  ...auditColumns,
}, (table) => [
  index('captures_created_idx').on(table.createdAt),
  index('captures_status_idx').on(table.status),
]);

// Uma ação proposta por fato reconhecido na captura (um áudio pode gerar várias).
export const proposedActions = pgTable('proposed_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  captureId: uuid('capture_id').notNull().references(() => captures.id, { onDelete: 'cascade' }),
  actionType: proposedActionType('action_type').notNull(),
  rawIntent: jsonb('raw_intent'),
  resolvedPayload: jsonb('resolved_payload'),
  issues: jsonb('issues'),
  commitStatus: proposedActionCommitStatus('commit_status').notNull().default('NEEDS_REVIEW'),
  status: proposedActionStatus('status').notNull().default('NEEDS_REVIEW'),
  committedRecordType: text('committed_record_type'),
  committedRecordId: uuid('committed_record_id'),
  ...auditColumns,
}, (table) => [
  index('proposed_actions_capture_idx').on(table.captureId),
  index('proposed_actions_status_idx').on(table.status),
]);

// Zonas do mapa do jogo: 1 perímetro ativo; pastos podem apontar para um lote
// (1 pasto ativo por lote). `ring` é o anel em lat/lng originais do traçado —
// fonte única; projeção e suavização são derivadas no domínio.
export const mapZones = pgTable('map_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: mapZoneKind('kind').notNull(),
  name: text('name').notNull(),
  herdGroupId: uuid('herd_group_id').references(() => herdGroups.id, { onDelete: 'set null' }),
  ring: jsonb('ring').notNull(),
  styleVariant: integer('style_variant').notNull().default(0),
  active: boolean('active').notNull().default(true),
  ...auditColumns,
}, (table) => [
  uniqueIndex('map_zones_perimeter_unique').on(table.kind).where(sql`${table.kind} = 'PERIMETER' and ${table.active}`),
  uniqueIndex('map_zones_herd_group_unique').on(table.herdGroupId).where(sql`${table.herdGroupId} is not null and ${table.active}`),
  check('map_zones_ring_min_points', sql`jsonb_array_length(${table.ring}) >= 3`),
  check('map_zones_perimeter_unlinked', sql`${table.kind} != 'PERIMETER' or ${table.herdGroupId} is null`),
]);

// Instalações do mapa (MVP: só MANGUEIRA tem ações; enum amplo é a costura
// para Depósito/Garagem/Casa). `position` = { lat, lng }.
export const mapInstallations = pgTable('map_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: mapInstallationKind('kind').notNull(),
  name: text('name').notNull(),
  position: jsonb('position').notNull(),
  active: boolean('active').notNull().default(true),
  ...auditColumns,
}, (table) => [
  uniqueIndex('map_installations_kind_unique').on(table.kind).where(sql`${table.active}`),
]);

// Catálogo de alimentos (nome PT-BR + unidade canônica). Toneladas viram KG no
// formulário (×1000); o banco só conhece a unidade canônica.
export const feedItems = pgTable('feed_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  canonicalUnit: feedUnit('canonical_unit').notNull(),
  active: boolean('active').notNull().default(true),
  ...auditColumns,
}, (table) => [uniqueIndex('feed_items_name_unique').on(table.name)]);

// Crédito de estoque: sempre vinculado a uma compra real (purchases). A compra
// segue o fluxo financeiro de sempre; a entry só credita o inventário.
export const feedPurchaseEntries = pgTable('feed_purchase_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedItemId: uuid('feed_item_id').notNull().references(() => feedItems.id, { onDelete: 'restrict' }),
  purchaseId: uuid('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('feed_purchase_entries_item_idx').on(table.feedItemId),
  index('feed_purchase_entries_purchase_idx').on(table.purchaseId),
  check('feed_purchase_entries_positive', sql`${table.quantity} > 0`),
]);

// Débito de estoque: um trato (evento de alimentação) com uma ou mais linhas.
export const feedingEvents = pgTable('feeding_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').notNull(),
  context: feedingContext('context').notNull(),
  herdGroupId: uuid('herd_group_id').references(() => herdGroups.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  index('feeding_events_date_idx').on(table.date),
  index('feeding_events_group_idx').on(table.herdGroupId),
]);

export const feedingEventItems = pgTable('feeding_event_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedingEventId: uuid('feeding_event_id').notNull().references(() => feedingEvents.id, { onDelete: 'cascade' }),
  feedItemId: uuid('feed_item_id').notNull().references(() => feedItems.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
}, (table) => [
  index('feeding_event_items_event_idx').on(table.feedingEventId),
  index('feeding_event_items_item_idx').on(table.feedItemId),
  check('feeding_event_items_positive', sql`${table.quantity} > 0`),
]);

// Um ciclo de plantio no talhão da Plantação. Só um GROWING por instalação;
// a colheita registra o que saiu (quantidade + unidade livres).
export const plantings = pgTable('plantings', {
  id: uuid('id').primaryKey().defaultRandom(),
  installationId: uuid('installation_id').notNull().references(() => mapInstallations.id, { onDelete: 'cascade' }),
  cropName: text('crop_name').notNull(),
  plantedAt: timestamp('planted_at', { withTimezone: true }).notNull().defaultNow(),
  durationHours: numeric('duration_hours', { precision: 10, scale: 3 }).notNull(),
  status: plantingStatus('status').notNull().default('GROWING'),
  harvestedAt: timestamp('harvested_at', { withTimezone: true }),
  harvestQuantity: numeric('harvest_quantity', { precision: 14, scale: 3 }),
  harvestUnit: text('harvest_unit'),
  notes: text('notes'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('plantings_growing_unique').on(table.installationId).where(sql`${table.status} = 'GROWING'`),
  index('plantings_installation_idx').on(table.installationId),
  check('plantings_duration_positive', sql`${table.durationHours} > 0`),
]);

// Insumos gastos no plantio: itens do Depósito (feed_item_id debita o saldo
// derivado, como um trato). Nome/unidade ficam como snapshot para o "recibo"
// da colheita sobreviver a renomes do catálogo.
export const plantingInputs = pgTable('planting_inputs', {
  id: uuid('id').primaryKey().defaultRandom(),
  plantingId: uuid('planting_id').notNull().references(() => plantings.id, { onDelete: 'cascade' }),
  feedItemId: uuid('feed_item_id').references(() => feedItems.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  unit: text('unit').notNull(),
}, (table) => [
  index('planting_inputs_planting_idx').on(table.plantingId),
  index('planting_inputs_feed_item_idx').on(table.feedItemId),
  check('planting_inputs_positive', sql`${table.quantity} > 0`),
]);

export type Animal = typeof animals.$inferSelect;
export type HerdGroup = typeof herdGroups.$inferSelect;
export type WeightSession = typeof weightSessions.$inferSelect;
export type MilkMeasurement = typeof milkMeasurements.$inferSelect;
export type DailyMilkTotal = typeof dailyMilkTotals.$inferSelect;
export type MilkCollection = typeof milkCollections.$inferSelect;
export type MastitisCase = typeof mastitisCases.$inferSelect;
export type Revenue = typeof revenues.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Capture = typeof captures.$inferSelect;
export type ProposedAction = typeof proposedActions.$inferSelect;
export type MapZone = typeof mapZones.$inferSelect;
export type MapInstallation = typeof mapInstallations.$inferSelect;
export type FeedItem = typeof feedItems.$inferSelect;
export type FeedPurchaseEntry = typeof feedPurchaseEntries.$inferSelect;
export type FeedingEvent = typeof feedingEvents.$inferSelect;
export type Planting = typeof plantings.$inferSelect;
export type PlantingInput = typeof plantingInputs.$inferSelect;
export type FeedingEventItem = typeof feedingEventItems.$inferSelect;
