import type { PeriodDays } from '../../domain/analytics';

const periods: Array<{ value: PeriodDays; label: string }> = [
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 180, label: '6 meses' },
  { value: 365, label: '1 ano' },
  { value: null, label: 'Tudo' },
];

export function PeriodSelector({ value, onChange }: { value: PeriodDays; onChange: (value: PeriodDays) => void }) {
  return <div className="flex flex-wrap gap-2" aria-label="Período do gráfico">{periods.map((period) => <button type="button" key={period.label} className={`period-chip ${value === period.value ? 'period-chip-active' : ''}`} aria-pressed={value === period.value} onClick={() => onChange(period.value)}>{period.label}</button>)}</div>;
}
