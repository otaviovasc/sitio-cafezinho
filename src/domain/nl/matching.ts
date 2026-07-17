import { normalizeLabel } from '../format.js';

export type MatchableAnimal = { id: string; name: string | null; tagNumber: string | null };
export type MatchableAlias = { animalId: string; normalizedAlias: string };

/**
 * Casamento determinístico e exato de um rótulo com um animal, por brinco, nome
 * normalizado ou alias. Nunca casa por aproximação: um rótulo desconhecido
 * devolve `undefined` para virar uma pendência de revisão, não um palpite.
 *
 * Fonte única do casamento usado pela importação de leite, pela pesagem e pela
 * camada de linguagem natural.
 */
export function matchAnimalByLabel<A extends MatchableAnimal>(
  rawLabel: string,
  animals: A[],
  aliases: MatchableAlias[],
): A | undefined {
  const normalized = normalizeLabel(rawLabel);
  const byTag = animals.find((animal) => animal.tagNumber === rawLabel.trim());
  const byName = animals.find((animal) => animal.name && normalizeLabel(animal.name) === normalized);
  const alias = aliases.find((item) => item.normalizedAlias === normalized);
  return byTag ?? byName ?? (alias ? animals.find((animal) => animal.id === alias.animalId) : undefined);
}
