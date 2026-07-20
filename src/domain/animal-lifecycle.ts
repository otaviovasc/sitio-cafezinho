import { participatesInMilking, type MilkingRoutine } from './herd.js';

export const animalStatuses = ['HEIFER', 'LACTATING', 'DRY', 'SOLD', 'DEAD', 'CALF', 'GROWING', 'BULL'] as const;
export type AnimalStatus = typeof animalStatuses[number];

export const animalSexes = ['FEMALE', 'MALE'] as const;
export type AnimalSex = typeof animalSexes[number];

const nextStatuses: Record<AnimalStatus, readonly AnimalStatus[]> = {
  HEIFER: ['LACTATING', 'SOLD', 'DEAD'],
  LACTATING: ['DRY', 'SOLD', 'DEAD'],
  DRY: ['LACTATING', 'SOLD', 'DEAD'],
  CALF: ['HEIFER', 'GROWING', 'BULL', 'SOLD', 'DEAD'],
  GROWING: ['SOLD', 'DEAD'],
  BULL: ['SOLD', 'DEAD'],
  SOLD: [],
  DEAD: [],
};

export function allowedNextStatuses(status: AnimalStatus) {
  return nextStatuses[status];
}

export function canTransitionStatus(from: AnimalStatus, to: AnimalStatus) {
  return nextStatuses[from].includes(to);
}

export function isLiveStatus(status: AnimalStatus) {
  return status !== 'SOLD' && status !== 'DEAD';
}

// Saídas (SOLD/DEAD) preservam o sexo do animal — não há o que validar.
export function statusAllowedForSex(status: AnimalStatus, sex: AnimalSex) {
  if (status === 'HEIFER' || status === 'LACTATING' || status === 'DRY') return sex === 'FEMALE';
  if (status === 'BULL') return sex === 'MALE';
  return true;
}

export function statusRequiresMilkingGroup(status: AnimalStatus) {
  return status === 'LACTATING';
}

export function statusEndsMilkingGroup(status: AnimalStatus) {
  return status !== 'LACTATING';
}

// Compatibilidade rotina×situação: lactação exige lote com ordenha; demais
// situações vivas só aceitam lote sem ordenha; saídas não têm lote.
export function statusMatchesGroupRoutine(status: AnimalStatus, routine: MilkingRoutine) {
  if (status === 'LACTATING') return participatesInMilking(routine);
  if (isLiveStatus(status)) return routine === 'NOT_MILKED';
  return false;
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
