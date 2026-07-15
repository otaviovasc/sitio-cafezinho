export const animalStatuses = ['HEIFER', 'LACTATING', 'DRY', 'SOLD', 'DEAD'] as const;
export type AnimalStatus = typeof animalStatuses[number];

const nextStatuses: Record<AnimalStatus, readonly AnimalStatus[]> = {
  HEIFER: ['LACTATING', 'SOLD', 'DEAD'],
  LACTATING: ['DRY', 'SOLD', 'DEAD'],
  DRY: ['LACTATING', 'SOLD', 'DEAD'],
  SOLD: [],
  DEAD: [],
};

export function allowedNextStatuses(status: AnimalStatus) {
  return nextStatuses[status];
}

export function canTransitionStatus(from: AnimalStatus, to: AnimalStatus) {
  return nextStatuses[from].includes(to);
}

export function statusRequiresMilkingGroup(status: AnimalStatus) {
  return status === 'LACTATING';
}

export function statusEndsMilkingGroup(status: AnimalStatus) {
  return status !== 'LACTATING';
}

export function isProductiveCycleTransition(from: AnimalStatus, to: AnimalStatus) {
  return (from === 'LACTATING' && to === 'DRY') || ((from === 'DRY' || from === 'HEIFER') && to === 'LACTATING');
}

export function statusTone(status: AnimalStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'LACTATING') return 'success';
  if (status === 'DRY' || status === 'HEIFER') return 'warning';
  if (status === 'SOLD' || status === 'DEAD') return 'danger';
  return 'neutral';
}
