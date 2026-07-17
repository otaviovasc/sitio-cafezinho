import { dateKeyInSaoPaulo } from '../purchases.js';
import { normalizeLabel } from '../format.js';
import type { MilkingRoutine } from '../herd.js';
import type {
  DailyMilkTotalIntent,
  IndividualMilkSessionIntent,
  SpokenDate,
  VoiceIntent,
} from './intents.js';

export type ProposedActionType =
  | 'DAILY_MILK_TOTAL'
  | 'INDIVIDUAL_MILK_SESSION'
  | 'MILK_COLLECTION'
  | 'MASTITIS_CASE'
  | 'PURCHASE'
  | 'REVENUE'
  | 'WEIGHT_SESSION'
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

/** Despacha uma intenção para o resolvedor determinístico correspondente. */
export function resolveIntent(intent: VoiceIntent, groups: ResolvableGroup[], now = new Date()): ResolvedAction {
  switch (intent.type) {
    case 'daily_milk_total':
      return resolveDailyMilkTotal(intent, groups, now);
    case 'individual_milk_session':
      return resolveIndividualMilkSession(intent, now);
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
