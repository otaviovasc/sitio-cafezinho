import { normalizeLabel } from './format.js';

export type ServerMilkSource = {
  captureId: string;
  proposedActionId: string;
  rawAnimalLabel: string;
  rawValueText?: string | null;
  morningLiters?: number | null;
  afternoonLiters?: number | null;
  totalLiters?: number | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  notes?: string | null;
};

export type MilkSourceSelector = {
  captureId?: string | null;
  proposedActionId?: string | null;
  rawAnimalLabel: string;
};

export type MilkSourceActionCandidate = {
  id: string;
  captureId: string;
  actionType: string;
  status: string;
  committedRecordType: string | null;
  committedRecordId: string | null;
  sessionDate: unknown;
  herdGroupId: unknown;
};

export function milkSourceActionSetIssue(
  refs: Array<{ captureId: string; actionId: string }>,
  actions: MilkSourceActionCandidate[],
  scope: { sessionDate: string; herdGroupId: string | null; sessionId: string },
) {
  if (new Set(refs.map((ref) => ref.actionId)).size !== refs.length) return 'DUPLICATE_SOURCE_ACTION' as const;
  if (actions.length !== refs.length) return 'SOURCE_ACTION_CHANGED' as const;
  if (new Set(actions.map((action) => action.captureId)).size !== 1) return 'SOURCE_CAPTURE_MISMATCH' as const;
  for (const action of actions) {
    const ref = refs.find((candidate) => candidate.actionId === action.id);
    const actionGroupId = typeof action.herdGroupId === 'string' ? action.herdGroupId : null;
    if (!ref || ref.captureId !== action.captureId
      || action.actionType !== 'INDIVIDUAL_MILK_SESSION'
      || action.sessionDate !== scope.sessionDate
      || actionGroupId !== scope.herdGroupId) {
      return 'SOURCE_ACTION_SCOPE_MISMATCH' as const;
    }
    const committedHere = action.status === 'CONFIRMED'
      && action.committedRecordType === 'milk_session'
      && action.committedRecordId === scope.sessionId;
    if (action.status !== 'NEEDS_REVIEW' && !committedHere) return 'SOURCE_ACTION_ALREADY_REVIEWED' as const;
  }
  return null;
}

export function selectSourceAttachmentIds(
  documents: Array<{ ordinal: number; attachmentId: string | null }>,
  sourceOrdinals: number[],
  legacyAttachmentId: string | null,
) {
  if (!documents.length) return legacyAttachmentId ? [legacyAttachmentId] : [];
  return documents
    .filter((document) => !sourceOrdinals.length || sourceOrdinals.includes(document.ordinal))
    .flatMap((document) => document.attachmentId ? [document.attachmentId] : []);
}

export function deriveMilkImportProvenance(
  incoming: Array<{ rawAnimalLabel: string; sources?: MilkSourceSelector[] }>,
  available: ServerMilkSource[],
) {
  const usageCount = available.map(() => 0);
  const sourcesByMeasurement = incoming.map((measurement) => {
    const selectors = measurement.sources ?? [];
    const selectedIndexes = available.flatMap((source, index) => {
      const selected = selectors.length
        ? selectors.some((selector) =>
          selector.captureId === source.captureId
          && selector.proposedActionId === source.proposedActionId
          && normalizeLabel(selector.rawAnimalLabel) === normalizeLabel(source.rawAnimalLabel))
        : normalizeLabel(measurement.rawAnimalLabel) === normalizeLabel(source.rawAnimalLabel);
      return selected ? [index] : [];
    });
    selectedIndexes.forEach((index) => {
      usageCount[index] += 1;
    });
    return selectedIndexes.map((index) => available[index]);
  });

  const missingMeasurementIndex = sourcesByMeasurement.findIndex((sources) => sources.length === 0);
  if (missingMeasurementIndex >= 0) {
    return {
      ok: false as const,
      code: 'SOURCE_NOT_DERIVABLE' as const,
      measurementIndex: missingMeasurementIndex,
    };
  }
  if (usageCount.some((count) => count > 1)) {
    return {
      ok: false as const,
      code: 'SOURCE_REUSED' as const,
    };
  }
  if (usageCount.some((count) => count === 0)) {
    return {
      ok: false as const,
      code: 'SOURCE_ACTION_INCOMPLETE' as const,
    };
  }
  return { ok: true as const, sourcesByMeasurement };
}
