export const milkingRoutines = ['MORNING_AND_AFTERNOON', 'MORNING_ONLY', 'NOT_MILKED'] as const;

export type MilkingRoutine = typeof milkingRoutines[number];

export function participatesInMilking(routine: MilkingRoutine | null | undefined) {
  return routine === 'MORNING_AND_AFTERNOON' || routine === 'MORNING_ONLY';
}

export function requiresAfternoonMeasurement(routine: MilkingRoutine) {
  return routine === 'MORNING_AND_AFTERNOON';
}
