export const animalStatusLabels: Record<string, string> = {
  HEIFER: 'Novilha', LACTATING: 'Em lactação', DRY: 'Seca', SOLD: 'Vendida', DEAD: 'Morta',
};

export const categoryLabels: Record<string, string> = {
  FEED: 'Ração', MINERAL_SUPPLEMENT: 'Suplemento mineral', MEDICINE: 'Medicamento',
  MILKING_AND_HYGIENE: 'Ordenha e higiene', MAINTENANCE: 'Manutenção', FUEL: 'Combustível',
  ENERGY: 'Energia', ANIMAL_PURCHASE: 'Compra de animal', OTHER: 'Outro',
};

export const documentLabels: Record<string, string> = {
  INVOICE: 'Nota fiscal', BOLETO: 'Boleto', PAYMENT_RECEIPT: 'Comprovante',
  MILK_NOTEBOOK: 'Caderno de leite', OTHER: 'Outro',
};

export const unitLabels: Record<string, string> = {
  UNIT: 'Unidade', KG: 'kg', LITER: 'Litro', BAG: 'Saco', BOX: 'Caixa', OTHER: 'Outro',
};

export const milkingRoutineLabels: Record<string, string> = {
  MORNING_AND_AFTERNOON: 'Ordenha de manhã e à tarde',
  MORNING_ONLY: 'Ordenha somente de manhã',
  NOT_MILKED: 'Sem ordenha',
};

export const today = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
