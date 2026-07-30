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

export type AnimalMatchSuggestion<A> = {
  animal: A;
  kind: 'EXACT' | 'CONTEXTUAL_TAG' | 'FUZZY';
};

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

/**
 * Sugere um vínculo somente quando o contexto do lote deixa uma opção única.
 * Sugestão não é confirmação: o chamador mantém a linha em NEEDS_REVIEW.
 */
export function suggestAnimalByLabel<A extends MatchableAnimal, C extends MatchableAnimal>(
  rawLabel: string,
  animals: A[],
  aliases: MatchableAlias[],
  contextAnimals: C[],
): AnimalMatchSuggestion<A | C> | undefined {
  const exact = matchAnimalByLabel(rawLabel, animals, aliases);
  if (exact) return { animal: exact, kind: 'EXACT' };

  const contextIds = new Set(contextAnimals.map((animal) => animal.id));
  const numericTokens: string[] = normalizeLabel(rawLabel).match(/\d+/g) ?? [];
  const byContainedTag = contextAnimals.filter((animal) => animal.tagNumber && numericTokens.includes(animal.tagNumber));
  if (byContainedTag.length === 1) return { animal: byContainedTag[0], kind: 'CONTEXTUAL_TAG' };

  const normalized = normalizeLabel(rawLabel);
  if (normalized.length < 4) return undefined;
  const candidates = [
    ...contextAnimals.flatMap((animal) => animal.name ? [{ animal, label: normalizeLabel(animal.name) }] : []),
    ...aliases.flatMap((alias) => contextIds.has(alias.animalId)
      ? contextAnimals.flatMap((animal) => animal.id === alias.animalId ? [{ animal, label: alias.normalizedAlias }] : [])
      : []),
  ].map((candidate) => ({ ...candidate, distance: editDistance(normalized, candidate.label) }))
    .sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  if (!best) return undefined;
  const maximumDistance = Math.min(2, Math.max(1, Math.floor(Math.max(normalized.length, best.label.length) * 0.25)));
  if (best.distance > maximumDistance) return undefined;
  const equallyGood = candidates.filter((candidate) => candidate.distance === best.distance && candidate.animal.id !== best.animal.id);
  return equallyGood.length ? undefined : { animal: best.animal, kind: 'FUZZY' };
}
