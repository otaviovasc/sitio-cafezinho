import { individualProductionLabel, type IndividualProductionSummary } from './individual-production';

export function IndividualProductionHistory({ productions, empty = 'Sem medição individual' }: {
  productions: IndividualProductionSummary[];
  empty?: string;
}) {
  if (!productions.length) return <span className="text-sm text-[var(--muted)]">{empty}</span>;

  return <span className="grid gap-0.5 text-sm">
    {productions.slice(0, 2).map((production) => (
      <span key={production.id}>
        {individualProductionLabel(production)}
      </span>
    ))}
  </span>;
}
