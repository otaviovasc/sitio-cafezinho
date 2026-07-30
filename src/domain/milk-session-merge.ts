export type MilkMergeDecision = 'ADD' | 'COMPLETE_EXISTING' | 'KEEP_EXISTING' | 'REPLACE_EXISTING';

type ExistingMilkMeasurement = {
  id: string;
  animalId: string | null;
  status: string;
  morningLiters?: number | string | null;
  afternoonLiters?: number | string | null;
};

type IncomingMilkMeasurement = {
  animalId: string | null | undefined;
  status: string;
  morningLiters?: number | null;
  afternoonLiters?: number | null;
  mergeDecision?: MilkMergeDecision | null;
};

export type MilkMergeAction =
  | { incomingIndex: number; kind: 'ADD' }
  | { incomingIndex: number; kind: 'SKIP'; existingMeasurementId: string }
  | { incomingIndex: number; kind: 'COMPLETE'; existingMeasurementId: string }
  | { incomingIndex: number; kind: 'REPLACE'; existingMeasurementId: string };

function periodConflict(existing: number | string | null | undefined, incoming: number | null | undefined) {
  return existing != null && incoming != null && Math.abs(Number(existing) - incoming) > 0.011;
}

export function planMilkSessionMerge(
  existing: ExistingMilkMeasurement[],
  incoming: IncomingMilkMeasurement[],
) {
  const activeByAnimal = new Map(
    existing
      .filter((row): row is ExistingMilkMeasurement & { animalId: string } => Boolean(row.animalId) && row.status !== 'EXCLUDED')
      .map((row) => [row.animalId, row]),
  );
  const actions: MilkMergeAction[] = [];
  const conflicts: Array<{ incomingIndex: number; existingMeasurementId: string }> = [];

  incoming.forEach((row, incomingIndex) => {
    if (row.status === 'EXCLUDED') {
      actions.push({ incomingIndex, kind: 'ADD' });
      return;
    }
    const existingRow = row.animalId ? activeByAnimal.get(row.animalId) : undefined;
    if (!existingRow) {
      actions.push({ incomingIndex, kind: 'ADD' });
      return;
    }
    if (row.mergeDecision === 'KEEP_EXISTING') {
      actions.push({ incomingIndex, kind: 'SKIP', existingMeasurementId: existingRow.id });
      return;
    }
    if (row.mergeDecision === 'REPLACE_EXISTING') {
      actions.push({ incomingIndex, kind: 'REPLACE', existingMeasurementId: existingRow.id });
      return;
    }
    const hasPeriodValue = row.morningLiters != null || row.afternoonLiters != null;
    const hasConflict = periodConflict(existingRow.morningLiters, row.morningLiters)
      || periodConflict(existingRow.afternoonLiters, row.afternoonLiters);
    if (hasPeriodValue && !hasConflict) {
      actions.push({ incomingIndex, kind: 'COMPLETE', existingMeasurementId: existingRow.id });
      return;
    }
    conflicts.push({ incomingIndex, existingMeasurementId: existingRow.id });
  });

  return { actions, conflicts };
}
