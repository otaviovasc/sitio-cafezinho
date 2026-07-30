import { formatDate, formatLiters } from '../../../domain/format';

export type IndividualProductionSummary = {
  id: string;
  sessionDate: string;
  herdGroupId: string | null;
  herdGroupName: string | null;
  morningLiters: string | null;
  afternoonLiters: string | null;
  totalLiters: string | null;
};

export function individualProductionParts(production: IndividualProductionSummary) {
  const parts = [
    production.morningLiters !== null ? `Manhã ${formatLiters(production.morningLiters)}` : null,
    production.afternoonLiters !== null ? `Tarde ${formatLiters(production.afternoonLiters)}` : null,
  ].filter((part): part is string => part !== null);

  if (parts.length) return parts.join(' · ');
  return production.totalLiters !== null ? formatLiters(production.totalLiters) : 'Sem valor medido';
}

export function individualProductionLabel(production: IndividualProductionSummary) {
  return `${formatDate(production.sessionDate)} · ${individualProductionParts(production)}`;
}
