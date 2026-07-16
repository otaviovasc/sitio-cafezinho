export type RegistrationCandidate = {
  animalId: string | null;
  rawAnimalLabel: string;
  status: string;
  confidence: string;
};

export function canRegisterAnimalFromMeasurement(row: RegistrationCandidate) {
  return row.animalId === null
    && row.status !== 'EXCLUDED'
    && row.rawAnimalLabel.trim().length > 0
    && row.rawAnimalLabel !== '[rótulo ilegível]';
}

export function shouldSelectRegistrationByDefault(row: RegistrationCandidate) {
  return canRegisterAnimalFromMeasurement(row) && row.confidence !== 'LOW';
}

export function identityFromRawAnimalLabel(rawAnimalLabel: string) {
  const label = rawAnimalLabel.trim();
  return /^\d+$/.test(label)
    ? { name: null, tagNumber: label }
    : { name: label, tagNumber: null };
}
