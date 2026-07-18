import { dateKeyInSaoPaulo } from '../purchases.js';
import { normalizeLabel } from '../format.js';
import { tonsToKg, type FeedUnit, type FeedingContext } from '../feeding.js';
import type { MilkingRoutine } from '../herd.js';
import { matchAnimalByLabel, type MatchableAlias, type MatchableAnimal } from './matching.js';
import type {
  DailyMilkTotalIntent,
  FeedingEventIntent,
  FeedingLineIntent,
  FeedPurchaseIntent,
  IndividualMilkSessionIntent,
  MastitisIntent,
  MilkCollectionIntent,
  PurchaseIntent,
  RevenueIntent,
  SpokenDate,
  VoiceIntent,
} from './intents.js';

export type MatchableSupplier = { id: string; name: string };
export type MatchableFeedItem = { id: string; name: string; canonicalUnit: FeedUnit; active: boolean };
export type ResolveContext = {
  groups: ResolvableGroup[];
  animals: MatchableAnimal[];
  aliases: MatchableAlias[];
  suppliers: MatchableSupplier[];
  feedItems: MatchableFeedItem[];
};

function pickByKeyword(label: string | null, table: ReadonlyArray<readonly [readonly string[], string]>, fallback: string): string {
  if (!label) return fallback;
  const normalized = normalizeLabel(label);
  for (const [keywords, value] of table) if (keywords.some((keyword) => normalized.includes(keyword))) return value;
  return fallback;
}

// Palavras faladas → enums (rótulos normalizados, sem acento).
const COLLECTION_SOURCE = [
  [['tanque', 'resfriador'], 'TANK_READING'],
  [['caminhon', 'motorista', 'leiteiro'], 'DRIVER_READING'],
  [['comprovante', 'nota', 'recibo'], 'RECEIPT'],
] as const;
const REVENUE_CATEGORY = [
  [['leite'], 'MILK_SALE'],
  [['bezerr'], 'CALF_SALE'],
  [['descarte'], 'CULL_SALE'],
  [['animal', 'vaca', 'novilh', 'boi'], 'ANIMAL_SALE'],
] as const;
const PURCHASE_CATEGORY = [
  [['racao', 'alimento', 'silagem', 'milho', 'farelo'], 'FEED'],
  [['sal ', 'mineral', 'nucleo', 'suplement'], 'MINERAL_SUPPLEMENT'],
  [['remedio', 'medicament', 'antibiot', 'vacina', 'veterinar'], 'MEDICINE'],
  [['ordenha', 'higiene', 'detergente', 'limpeza', 'teteira'], 'MILKING_AND_HYGIENE'],
  [['manutenc', 'conserto', 'reparo', 'peca'], 'MAINTENANCE'],
  [['combustivel', 'diesel', 'gasolina', 'oleo'], 'FUEL'],
  [['energia', 'luz', 'eletric'], 'ENERGY'],
  [['compra de animal', 'novilh'], 'ANIMAL_PURCHASE'],
] as const;
const MASTITIS_QUARTER = [
  [['posterior direit', 'traseiro direit', 'tras direit'], 'REAR_RIGHT'],
  [['posterior esquerd', 'traseiro esquerd', 'tras esquerd'], 'REAR_LEFT'],
  [['anterior direit', 'dianteiro direit', 'frente direit'], 'FRONT_RIGHT'],
  [['anterior esquerd', 'dianteiro esquerd', 'frente esquerd'], 'FRONT_LEFT'],
  [['varios', 'multipl', 'mais de um', 'todos'], 'MULTIPLE'],
] as const;
const MASTITIS_DETECTION = [
  [['visual', 'olho', 'aparencia', 'grumo'], 'VISUAL'],
  [['caneca', 'fundo preto', 'tela'], 'BLACK_PLATE'],
  [['cmt', 'california'], 'CMT'],
  [['veterinar'], 'VETERINARY'],
] as const;

export type ProposedActionType =
  | 'DAILY_MILK_TOTAL'
  | 'INDIVIDUAL_MILK_SESSION'
  | 'MILK_COLLECTION'
  | 'MASTITIS_CASE'
  | 'PURCHASE'
  | 'REVENUE'
  | 'WEIGHT_SESSION'
  | 'FEED_PURCHASE'
  | 'FEEDING_EVENT'
  | 'UNKNOWN';

export type CommitStatus = 'READY' | 'NEEDS_REVIEW' | 'NEEDS_PERIOD' | 'UNREPRESENTABLE';

export type ResolvableGroup = { id: string; name: string; milkingRoutine: MilkingRoutine; active: boolean };

export type ResolvedAction = {
  actionType: ProposedActionType;
  rawIntent: VoiceIntent;
  resolvedPayload: Record<string, unknown>;
  issues: string[];
  commitStatus: CommitStatus;
};

const DAY_MS = 86_400_000;

/**
 * Resolve o token de data falado para uma data ISO no fuso de São Paulo.
 * `iso` explícito vence; senão "hoje/ontem/anteontem" é calculado a partir de
 * `now` (injetável — os testes passam uma data fixa).
 */
export function resolveSpokenDate(date: SpokenDate, now = new Date()): string {
  if (date.iso && /^\d{4}-\d{2}-\d{2}$/.test(date.iso)) return date.iso;
  const offset = date.relative === 'ontem' ? 1 : date.relative === 'anteontem' ? 2 : 0;
  return dateKeyInSaoPaulo(new Date(now.getTime() - offset * DAY_MS));
}

const ordinalWords: Record<string, number> = {
  primeiro: 1, primeira: 1, um: 1, uma: 1,
  segundo: 2, segunda: 2, dois: 2, duas: 2,
  terceiro: 3, terceira: 3, tres: 3,
  quarto: 4, quarta: 4, quatro: 4,
  quinto: 5, quinta: 5, cinco: 5,
};

/** Extrai o número de um rótulo de lote falado: dígito ("lote 2") ou palavra ("segundo lote"). */
export function extractLotNumber(label: string): number | null {
  const normalized = normalizeLabel(label);
  const tokens = normalized.split(' ');
  for (const token of tokens) {
    if (/^\d+$/.test(token)) return Number(token);
    if (token in ordinalWords) return ordinalWords[token];
  }
  return null;
}

/**
 * Resolve o rótulo de escopo ("primeiro lote", "lote 2", null=rebanho todo) para
 * um grupo real. Ciente de ordinais (corrige que normalizeLabel("primeiro lote")
 * !== "lote 1"). 0 ou >1 candidatos viram pendência de revisão, nunca palpite.
 */
export function resolveHerdGroup(
  scopeLabel: string | null | undefined,
  groups: ResolvableGroup[],
): { group: ResolvableGroup | null; issues: string[] } {
  if (!scopeLabel || !scopeLabel.trim()) return { group: null, issues: [] };
  const normalized = normalizeLabel(scopeLabel);

  const byName = groups.filter((group) => normalizeLabel(group.name) === normalized);
  if (byName.length === 1) return { group: byName[0], issues: [] };

  const number = extractLotNumber(scopeLabel);
  if (number !== null) {
    const byNumber = groups.filter((group) => normalizeLabel(group.name).split(' ').includes(String(number)));
    if (byNumber.length === 1) return { group: byNumber[0], issues: [] };
    if (byNumber.length > 1) {
      return { group: null, issues: [`Vários lotes correspondem a “${scopeLabel}”: ${byNumber.map((group) => group.name).join(', ')}. Selecione o lote.`] };
    }
  }
  return { group: null, issues: [`Lote “${scopeLabel}” não encontrado. Selecione o lote manualmente.`] };
}

/**
 * Total diário. Cada período pode chegar sozinho: a manhã agora e a tarde
 * depois (ou só a tarde) completam o mesmo registro. Por isso "só a tarde" e
 * "manhã sem a tarde" são READY — o merge no serviço junta os períodos. Só cai
 * para revisão quando o lote é ambíguo, não há valor, ou a tarde foi dita para
 * um lote que só ordenha de manhã. Nunca inventa um período.
 */
export function resolveDailyMilkTotal(
  intent: DailyMilkTotalIntent,
  groups: ResolvableGroup[],
  now = new Date(),
): ResolvedAction {
  const productionDate = resolveSpokenDate(intent.date, now);
  const { group, issues } = resolveHerdGroup(intent.scopeLabel, groups);
  const allIssues = [...issues];
  const morning = intent.morningLiters;
  const afternoon = intent.afternoonLiters;
  let commitStatus: CommitStatus = 'READY';

  if (intent.scopeLabel && !group) {
    commitStatus = 'NEEDS_REVIEW';
  } else if (morning === null && afternoon === null) {
    commitStatus = 'NEEDS_REVIEW';
    allIssues.push('Nenhum valor de leite reconhecido.');
  } else if (group?.milkingRoutine === 'NOT_MILKED') {
    commitStatus = 'NEEDS_REVIEW';
    allIssues.push(`O lote ${group.name} não participa da ordenha.`);
  } else if (group?.milkingRoutine === 'MORNING_ONLY' && afternoon !== null) {
    commitStatus = 'NEEDS_REVIEW';
    allIssues.push(`O lote ${group.name} ordenha somente pela manhã; confira o valor da tarde.`);
  }

  return {
    actionType: 'DAILY_MILK_TOTAL',
    rawIntent: intent,
    resolvedPayload: {
      productionDate,
      herdGroupId: group?.id ?? null,
      morningLiters: morning,
      afternoonLiters: afternoon,
      notes: intent.notes,
      // campos de exibição (a revisão mostra; buildBody do commit-registry ignora)
      scopeLabel: intent.scopeLabel,
      resolvedGroupName: group?.name ?? null,
      rawValueText: intent.rawValueText,
    },
    issues: allIssues,
    commitStatus,
  };
}

/**
 * Controle individual. Produz exatamente o objeto de importação de leite
 * (sessionDate + sourceMode + measurements) para reaproveitar a validação e a
 * revisão que já existem. O casamento por animal e as inconsistências vêm do
 * validador de importação; aqui não se casa animal (fica sempre para revisão).
 */
export function resolveIndividualMilkSession(
  intent: IndividualMilkSessionIntent,
  now = new Date(),
): ResolvedAction {
  const sessionDate = resolveSpokenDate(intent.date, now);
  const measurements = intent.measurements.map((row) => {
    const total = row.totalLiters
      ?? (row.morningLiters !== null || row.afternoonLiters !== null ? (row.morningLiters ?? 0) + (row.afternoonLiters ?? 0) : null);
    return {
      rawAnimalLabel: row.animalLabel,
      rawValueText: row.rawValueText,
      morningLiters: row.morningLiters,
      afternoonLiters: row.afternoonLiters,
      totalLiters: total,
      confidence: row.confidence,
      excluded: false,
      notes: row.notes,
    };
  });
  return {
    actionType: 'INDIVIDUAL_MILK_SESSION',
    rawIntent: intent,
    resolvedPayload: {
      import: { sessionDate, sourceMode: 'SEPARATE_MORNING_AFTERNOON', measurements },
    },
    issues: [],
    commitStatus: 'NEEDS_REVIEW',
  };
}

function isoNoon(date: string) {
  return `${date}T12:00:00-03:00`;
}

export function resolveMilkCollection(intent: MilkCollectionIntent, now = new Date()): ResolvedAction {
  const issues: string[] = [];
  let commitStatus: CommitStatus = 'READY';
  if (intent.liters === null || intent.liters <= 0) { commitStatus = 'NEEDS_REVIEW'; issues.push('Informe o volume da coleta.'); }
  return {
    actionType: 'MILK_COLLECTION',
    rawIntent: intent,
    resolvedPayload: {
      collectionDate: resolveSpokenDate(intent.date, now),
      liters: intent.liters,
      source: pickByKeyword(intent.sourceLabel, COLLECTION_SOURCE, 'TANK_READING'),
      notes: intent.notes,
      rawValueText: intent.rawValueText,
    },
    issues,
    commitStatus,
  };
}

export function resolveRevenue(intent: RevenueIntent, now = new Date()): ResolvedAction {
  const issues: string[] = [];
  let commitStatus: CommitStatus = 'READY';
  if (intent.amount === null || intent.amount <= 0) { commitStatus = 'NEEDS_REVIEW'; issues.push('Informe o valor da receita.'); }
  const description = intent.description.trim() || (intent.categoryLabel?.trim() ?? '');
  if (!description) { commitStatus = 'NEEDS_REVIEW'; issues.push('Informe a descrição da receita.'); }
  return {
    actionType: 'REVENUE',
    rawIntent: intent,
    resolvedPayload: {
      revenueDate: resolveSpokenDate(intent.date, now),
      category: pickByKeyword(intent.categoryLabel, REVENUE_CATEGORY, 'OTHER'),
      description: description || 'Receita',
      amount: intent.amount,
      status: intent.received ? 'RECEIVED' : 'EXPECTED',
      buyerName: intent.buyerName,
      notes: intent.notes,
    },
    issues,
    commitStatus,
  };
}

export function resolvePurchase(intent: PurchaseIntent, suppliers: MatchableSupplier[], now = new Date()): ResolvedAction {
  const issues: string[] = [];
  let commitStatus: CommitStatus = 'READY';
  if (intent.amount === null || intent.amount <= 0) { commitStatus = 'NEEDS_REVIEW'; issues.push('Informe o valor da compra.'); }
  const description = intent.description.trim() || (intent.categoryLabel?.trim() ?? '');
  if (!description) { commitStatus = 'NEEDS_REVIEW'; issues.push('Informe a descrição da compra.'); }
  let supplierId: string | null = null;
  if (intent.supplierLabel) {
    const normalized = normalizeLabel(intent.supplierLabel);
    const supplier = suppliers.find((item) => normalizeLabel(item.name) === normalized);
    supplierId = supplier?.id ?? null;
    if (!supplier) issues.push(`Fornecedor “${intent.supplierLabel}” não cadastrado; será salvo sem vínculo.`);
  }
  return {
    actionType: 'PURCHASE',
    rawIntent: intent,
    resolvedPayload: {
      purchaseDate: resolveSpokenDate(intent.date, now),
      description: description || 'Compra',
      category: pickByKeyword(intent.categoryLabel, PURCHASE_CATEGORY, 'OTHER'),
      totalAmount: intent.amount,
      dueDate: intent.dueDate ? resolveSpokenDate(intent.dueDate, now) : null,
      supplierId,
      supplierLabel: intent.supplierLabel,
      status: intent.paid ? 'PAID' : 'OPEN',
      notes: intent.notes,
    },
    issues,
    commitStatus,
  };
}

export function resolveMastitis(intent: MastitisIntent, animals: MatchableAnimal[], aliases: MatchableAlias[], now = new Date()): ResolvedAction {
  const issues: string[] = [];
  let commitStatus: CommitStatus = 'READY';
  const match = matchAnimalByLabel(intent.animalLabel, animals, aliases);
  if (!match) { commitStatus = 'NEEDS_REVIEW'; issues.push(`Animal “${intent.animalLabel}” não encontrado; selecione ou cadastre.`); }
  if (!intent.observedSigns && !intent.notes) { commitStatus = 'NEEDS_REVIEW'; issues.push('Informe o sinal observado.'); }
  return {
    actionType: 'MASTITIS_CASE',
    rawIntent: intent,
    resolvedPayload: {
      animalId: match?.id ?? null,
      animalLabel: intent.animalLabel,
      animalName: match?.name ?? match?.tagNumber ?? null,
      detectedAt: isoNoon(resolveSpokenDate(intent.date, now)),
      affectedQuarter: pickByKeyword(intent.quarterLabel, MASTITIS_QUARTER, 'UNKNOWN'),
      detectionMethod: pickByKeyword(intent.detectionLabel, MASTITIS_DETECTION, 'UNKNOWN'),
      observedSigns: intent.observedSigns,
      status: 'OBSERVATION',
      notes: intent.notes,
    },
    issues,
    commitStatus,
  };
}

/**
 * Casamento exato de item de alimentação por nome normalizado (regra do repo:
 * sem fuzzy). Desconhecido → undefined, que vira pendência de revisão — nunca
 * cria item novo por inferência.
 */
export function matchFeedItemByLabel(rawLabel: string, feedItems: MatchableFeedItem[]): MatchableFeedItem | undefined {
  const normalized = normalizeLabel(rawLabel);
  return feedItems.find((item) => item.active && normalizeLabel(item.name) === normalized);
}

/**
 * Converte quantidade+unidade FALADAS para a unidade canônica do item.
 * Determinístico: toneladas ×1000 (só para itens em KG); sacos/fardos não têm
 * conversão conhecida → null com issue (a revisão pede a quantidade certa).
 * Unidade não dita → assume a canônica, mas marca para conferência.
 */
export function resolveFeedQuantity(
  quantity: number | null,
  unitLabel: string | null,
  canonicalUnit: FeedUnit,
): { quantity: number | null; issue: string | null } {
  if (quantity === null || quantity <= 0) return { quantity: null, issue: 'Informe a quantidade.' };
  if (!unitLabel || !unitLabel.trim()) {
    return { quantity, issue: `Unidade não informada; confirme se o valor está em ${canonicalUnit === 'KG' ? 'kg' : canonicalUnit === 'LITER' ? 'litros' : 'unidades'}.` };
  }
  const normalized = normalizeLabel(unitLabel);
  const isTon = /\btoneladas?\b|^t$|^ton$/.test(normalized);
  const isKg = /quilos?|kilos?|^kgs?$/.test(normalized);
  const isLiter = /litros?|^l$|^lts?$/.test(normalized);
  const isUnit = /unidades?|^un$|pecas?/.test(normalized);
  if (canonicalUnit === 'KG') {
    if (isTon) return { quantity: tonsToKg(quantity), issue: null };
    if (isKg) return { quantity, issue: null };
  }
  if (canonicalUnit === 'LITER' && isLiter) return { quantity, issue: null };
  if (canonicalUnit === 'UNIT' && isUnit) return { quantity, issue: null };
  return { quantity: null, issue: `Não sei converter “${unitLabel}” para a unidade do item; informe a quantidade na revisão.` };
}

const FEEDING_CONTEXT_KEYWORDS = [
  [['ordenha', 'mangueira', 'sala de ordenha'], 'MILKING'],
  [['estacao', 'cocho', 'confinamento'], 'STATION'],
  [['pasto', 'piquete', 'campo'], 'PASTURE'],
] as const;

function resolveFeedingContext(contextLabel: string | null): FeedingContext | null {
  if (!contextLabel) return null;
  const normalized = normalizeLabel(contextLabel);
  for (const [keywords, value] of FEEDING_CONTEXT_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return value;
  }
  return null;
}

/**
 * Compra de alimento: cria a compra financeira real + a entry que credita o
 * estoque. Só fica READY quando o item casa exatamente, a quantidade é
 * conversível para a unidade canônica e o valor foi dito.
 */
export function resolveFeedPurchase(intent: FeedPurchaseIntent, ctx: ResolveContext, now = new Date()): ResolvedAction {
  const issues: string[] = [];
  let commitStatus: CommitStatus = 'READY';
  const item = matchFeedItemByLabel(intent.itemLabel, ctx.feedItems);
  let quantity: number | null = null;
  if (!item) {
    commitStatus = 'NEEDS_REVIEW';
    issues.push(`Item “${intent.itemLabel}” não está no catálogo de alimentação; selecione ou cadastre antes de confirmar.`);
  } else {
    const resolved = resolveFeedQuantity(intent.quantity, intent.unitLabel, item.canonicalUnit);
    quantity = resolved.quantity;
    if (resolved.issue) {
      commitStatus = 'NEEDS_REVIEW';
      issues.push(resolved.issue);
    }
  }
  if (intent.amount === null || intent.amount <= 0) {
    commitStatus = 'NEEDS_REVIEW';
    issues.push('Informe o valor da compra.');
  }
  let supplierId: string | null = null;
  if (intent.supplierLabel) {
    const normalized = normalizeLabel(intent.supplierLabel);
    const supplier = ctx.suppliers.find((row) => normalizeLabel(row.name) === normalized);
    supplierId = supplier?.id ?? null;
    if (!supplier) issues.push(`Fornecedor “${intent.supplierLabel}” não cadastrado; será salvo sem vínculo.`);
  }
  return {
    actionType: 'FEED_PURCHASE',
    rawIntent: intent,
    resolvedPayload: {
      purchaseDate: resolveSpokenDate(intent.date, now),
      description: `Compra de ${item?.name ?? intent.itemLabel}`,
      category: 'FEED',
      totalAmount: intent.amount,
      status: intent.paid ? 'PAID' : 'OPEN',
      supplierId,
      feedItemId: item?.id ?? null,
      quantity,
      notes: intent.notes,
      // campos de exibição para a revisão
      itemLabel: intent.itemLabel,
      resolvedItemName: item?.name ?? null,
      canonicalUnit: item?.canonicalUnit ?? null,
      spokenQuantity: intent.quantity,
      spokenUnit: intent.unitLabel,
      supplierLabel: intent.supplierLabel,
      rawValueText: intent.rawValueText,
    },
    issues,
    commitStatus,
  };
}

/**
 * Trato falado: contexto por palavra-chave, lote por casamento exato (ciente
 * de ordinais) e cada linha item+quantidade convertida para a unidade
 * canônica. Qualquer ponta solta (item desconhecido, unidade não conversível,
 * contexto não dito, lote obrigatório ausente) → NEEDS_REVIEW, nunca palpite.
 */
export function resolveFeedingEvent(intent: FeedingEventIntent, ctx: ResolveContext, now = new Date()): ResolvedAction {
  const issues: string[] = [];
  let commitStatus: CommitStatus = 'READY';

  const context = resolveFeedingContext(intent.contextLabel);
  if (!context) {
    commitStatus = 'NEEDS_REVIEW';
    issues.push(intent.contextLabel
      ? `Não reconheci onde o trato foi dado (“${intent.contextLabel}”); escolha na revisão.`
      : 'Informe onde o trato foi dado (ordenha, estação ou pasto).');
  }

  const { group, issues: groupIssues } = resolveHerdGroup(intent.scopeLabel, ctx.groups);
  issues.push(...groupIssues);
  if (intent.scopeLabel && !group) commitStatus = 'NEEDS_REVIEW';
  if (context === 'MILKING' && !group) {
    commitStatus = 'NEEDS_REVIEW';
    if (!intent.scopeLabel) issues.push('Trato da ordenha precisa do lote; selecione na revisão.');
  }
  if (context === 'MILKING' && group?.milkingRoutine === 'NOT_MILKED') {
    commitStatus = 'NEEDS_REVIEW';
    issues.push(`O lote ${group.name} não participa da ordenha.`);
  }

  const items = intent.lines.map((line: FeedingLineIntent) => {
    const item = matchFeedItemByLabel(line.itemLabel, ctx.feedItems);
    if (!item) {
      commitStatus = 'NEEDS_REVIEW';
      issues.push(`Item “${line.itemLabel}” não está no catálogo de alimentação; selecione ou cadastre antes de confirmar.`);
      return { feedItemId: null, itemLabel: line.itemLabel, resolvedItemName: null, canonicalUnit: null, quantity: null, spokenQuantity: line.quantity, spokenUnit: line.unitLabel, rawValueText: line.rawValueText };
    }
    const resolved = resolveFeedQuantity(line.quantity, line.unitLabel, item.canonicalUnit);
    if (resolved.issue) {
      commitStatus = 'NEEDS_REVIEW';
      issues.push(`${item.name}: ${resolved.issue}`);
    }
    return { feedItemId: item.id, itemLabel: line.itemLabel, resolvedItemName: item.name, canonicalUnit: item.canonicalUnit, quantity: resolved.quantity, spokenQuantity: line.quantity, spokenUnit: line.unitLabel, rawValueText: line.rawValueText };
  });

  return {
    actionType: 'FEEDING_EVENT',
    rawIntent: intent,
    resolvedPayload: {
      date: resolveSpokenDate(intent.date, now),
      context,
      herdGroupId: group?.id ?? null,
      items,
      notes: intent.notes,
      // campos de exibição para a revisão
      contextLabel: intent.contextLabel,
      scopeLabel: intent.scopeLabel,
      resolvedGroupName: group?.name ?? null,
    },
    issues,
    commitStatus,
  };
}

/** Despacha uma intenção para o resolvedor determinístico correspondente. */
export function resolveIntent(intent: VoiceIntent, ctx: ResolveContext, now = new Date()): ResolvedAction {
  switch (intent.type) {
    case 'daily_milk_total': return resolveDailyMilkTotal(intent, ctx.groups, now);
    case 'individual_milk_session': return resolveIndividualMilkSession(intent, now);
    case 'milk_collection': return resolveMilkCollection(intent, now);
    case 'revenue': return resolveRevenue(intent, now);
    case 'purchase': return resolvePurchase(intent, ctx.suppliers, now);
    case 'mastitis_case': return resolveMastitis(intent, ctx.animals, ctx.aliases, now);
    case 'feed_purchase': return resolveFeedPurchase(intent, ctx, now);
    case 'feeding_event': return resolveFeedingEvent(intent, ctx, now);
    case 'unknown':
      return {
        actionType: 'UNKNOWN',
        rawIntent: intent,
        resolvedPayload: { reason: intent.reason },
        issues: [intent.reason || 'Não identifiquei uma ação nesta fala.'],
        commitStatus: 'NEEDS_REVIEW',
      };
  }
}
