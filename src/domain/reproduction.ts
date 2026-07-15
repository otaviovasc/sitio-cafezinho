export const reproductiveOutcomes = ['PENDING', 'NOT_PREGNANT', 'PREGNANT'] as const;
export type ReproductiveOutcome = typeof reproductiveOutcomes[number];

export type ReproductiveEventSummaryInput = {
  type: 'HEAT' | 'CALVING';
  occurredOn: string;
  hadBreeding: boolean;
  outcome: ReproductiveOutcome | null;
};

export function summarizeReproduction(events: ReproductiveEventSummaryInput[]) {
  const chronological = [...events].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  const lastCalving = [...chronological].reverse().find((event) => event.type === 'CALVING');
  const cycleEvents = lastCalving
    ? chronological.filter((event) => event.occurredOn >= lastCalving.occurredOn)
    : chronological;
  const attempts = cycleEvents.filter((event) => event.type === 'HEAT' && event.hadBreeding);
  const lastPregnancy = [...cycleEvents].reverse().find((event) => event.type === 'HEAT' && event.hadBreeding && event.outcome === 'PREGNANT');
  const lastHeat = [...chronological].reverse().find((event) => event.type === 'HEAT');
  const attemptsUntilLastPregnancy = lastPregnancy
    ? cycleEvents.filter((event) => event.type === 'HEAT' && event.hadBreeding && event.occurredOn <= lastPregnancy.occurredOn).length
    : null;
  return {
    lastCalvingOn: lastCalving?.occurredOn ?? null,
    lastHeatOn: lastHeat?.occurredOn ?? null,
    attemptsInCurrentCycle: attempts.length,
    pendingAttempts: attempts.filter((event) => event.outcome === 'PENDING').length,
    lastPregnancyOn: lastPregnancy?.occurredOn ?? null,
    attemptsUntilLastPregnancy,
  };
}
