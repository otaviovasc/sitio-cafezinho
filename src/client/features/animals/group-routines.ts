import type { MilkingRoutine } from '../../../domain/herd';

/** Lotes com rotina de ordenha (para vacas em lactação e produção). */
export const milkingGroupRoutines: readonly MilkingRoutine[] = ['MORNING_AND_AFTERNOON', 'MORNING_ONLY'];
/** Lotes sem ordenha: manejo de animais vivos fora da lactação. */
export const nonMilkingGroupRoutines: readonly MilkingRoutine[] = ['NOT_MILKED'];
