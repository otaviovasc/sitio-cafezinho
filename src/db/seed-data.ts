export type SeedMeasurement = {
  rawAnimalLabel: string;
  totalLiters: number;
  rawValueText?: string;
};

export const confirmedSeed: SeedMeasurement[] = [
  { rawAnimalLabel: '141', totalLiters: 11 },
  { rawAnimalLabel: 'Caruja', totalLiters: 21 },
  { rawAnimalLabel: 'Landrina', totalLiters: 13.5 },
  { rawAnimalLabel: 'Negona', totalLiters: 16.5 },
  { rawAnimalLabel: 'Zoio', totalLiters: 12 },
  { rawAnimalLabel: 'Parana', totalLiters: 15 },
  { rawAnimalLabel: '296', totalLiters: 19 },
  { rawAnimalLabel: 'Saude', totalLiters: 17.5 },
  { rawAnimalLabel: '3 Verm', totalLiters: 14 },
  { rawAnimalLabel: 'Pata B', totalLiters: 13.5 },
  { rawAnimalLabel: 'Banana', totalLiters: 23.5 },
  { rawAnimalLabel: '184', totalLiters: 21 },
  { rawAnimalLabel: 'America', totalLiters: 11 },
  { rawAnimalLabel: '7 Bela', totalLiters: 15 },
  { rawAnimalLabel: 'Leo', totalLiters: 16.5 },
  { rawAnimalLabel: 'Girinha', totalLiters: 20 },
  { rawAnimalLabel: 'Malhada', totalLiters: 19.5 },
  { rawAnimalLabel: 'Granada', totalLiters: 17 },
  { rawAnimalLabel: 'Chocolate', totalLiters: 16 },
  { rawAnimalLabel: 'Atleta', totalLiters: 24.5 },
  { rawAnimalLabel: '514', totalLiters: 20.5 },
  { rawAnimalLabel: 'Montana', totalLiters: 16.5 },
  { rawAnimalLabel: '52', totalLiters: 19.5 },
  { rawAnimalLabel: '90', totalLiters: 14 },
  { rawAnimalLabel: 'Balbalu', totalLiters: 18.5 },
  { rawAnimalLabel: 'Bisteca', totalLiters: 14.5 },
  { rawAnimalLabel: 'Rebeca', totalLiters: 12.5 },
  { rawAnimalLabel: 'Sereleira', totalLiters: 15 },
  { rawAnimalLabel: 'Mansinha', totalLiters: 21 },
  { rawAnimalLabel: '100 Preta', totalLiters: 20.5 },
  { rawAnimalLabel: 'Gigi', totalLiters: 11.5 },
  { rawAnimalLabel: 'Sheron', totalLiters: 15 },
  { rawAnimalLabel: 'Maquinha', totalLiters: 9 },
  { rawAnimalLabel: 'Zuleide', totalLiters: 8.5 },
  { rawAnimalLabel: 'Gigante', totalLiters: 13 },
  { rawAnimalLabel: 'Cubicao', totalLiters: 17 },
  { rawAnimalLabel: 'Formosa', totalLiters: 20 },
  { rawAnimalLabel: 'Caninha', totalLiters: 17 },
  { rawAnimalLabel: '61', totalLiters: 11 },
  { rawAnimalLabel: 'Cigana', totalLiters: 11 },
  { rawAnimalLabel: '503', totalLiters: 21 },
  { rawAnimalLabel: 'Jamaica', totalLiters: 19 },
  { rawAnimalLabel: 'Pequena', totalLiters: 13.5 },
  { rawAnimalLabel: '99', totalLiters: 14.5 },
  { rawAnimalLabel: 'Pintada', totalLiters: 14 },
];

export const pendingSeed: SeedMeasurement = {
  rawAnimalLabel: '512',
  rawValueText: '13???',
  totalLiters: 13,
};

export const excludedSeed: SeedMeasurement[] = [
  { rawAnimalLabel: 'Fofa', rawValueText: '10,5', totalLiters: 10.5 },
  { rawAnimalLabel: 'Brodante', rawValueText: '14', totalLiters: 14 },
  { rawAnimalLabel: 'Bento vi', rawValueText: '12', totalLiters: 12 },
  { rawAnimalLabel: 'Aninha', rawValueText: '8,5', totalLiters: 8.5 },
  { rawAnimalLabel: '99', rawValueText: '5,5', totalLiters: 5.5 },
  { rawAnimalLabel: 'Antonia', rawValueText: '6,5', totalLiters: 6.5 },
  { rawAnimalLabel: '512', rawValueText: '3,5', totalLiters: 3.5 },
  { rawAnimalLabel: '53', rawValueText: '9,5', totalLiters: 9.5 },
  { rawAnimalLabel: 'Granada', rawValueText: '8,5', totalLiters: 8.5 },
  { rawAnimalLabel: 'Morena', rawValueText: '6,2', totalLiters: 6.2 },
];

export const seedConfirmedTotal = confirmedSeed.reduce((sum, row) => sum + row.totalLiters, 0);
