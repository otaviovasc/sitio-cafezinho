/** Helpers do fluxo de mastite (sem componentes — fast-refresh). */

export function mastitisAnimalName(animal: { name?: string | null; animalName?: string | null; tagNumber: string | null }) { return animal.name || animal.animalName || `Brinco ${animal.tagNumber}`; }
export function dateFromTimestamp(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : ''; }
export function noonIso(value: string) { return new Date(`${value}T12:00:00-03:00`).toISOString(); }
