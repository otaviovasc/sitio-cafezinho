import { Link } from 'react-router-dom';
import { Scale, Upload } from 'lucide-react';
import { formatWeight, weightChange } from '../../../domain/weight';
import { InlineEmpty, ScrollArea, SectionCard, StatusBadge } from '../../components/ui';
import { weightMeasurementStatusDescriptor } from '../../lib/status';

export type AnimalWeight = {
  id: string;
  measuredAt: string;
  sessionDate: string | null;
  sessionId: string | null;
  weightKg: string | null;
  confidence: string;
  status: string;
  notes: string | null;
};

export function AnimalWeightPanel({ weights }: { weights: AnimalWeight[] }) {
  const confirmed = weights.filter((row) => row.status === 'CONFIRMED' && row.weightKg !== null);
  return <SectionCard title="Histórico de pesagens" icon={Scale} className="lg:col-span-2">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted)]">Somente medições reais; linhas em revisão permanecem identificadas.</p><Link className="button button-secondary" to="/pesos/novo"><Upload size={17} aria-hidden />Nova pesagem</Link></div>
    {!weights.length ? <InlineEmpty>Nenhuma pesagem registrada.</InlineEmpty> : <ScrollArea label="Histórico de pesagens">{weights.map((row) => {
      const confirmedIndex = confirmed.findIndex((candidate) => candidate.id === row.id);
      const previous = confirmedIndex >= 0 ? confirmed[confirmedIndex + 1] : null;
      const delta = row.weightKg !== null && previous?.weightKg ? weightChange(row.weightKg, previous.weightKg) : null;
      return <div className="mobile-item" key={row.id}><span><strong>{new Date(row.measuredAt).toLocaleDateString('pt-BR')}</strong><span className="block text-xs text-[var(--muted)]">{row.notes || 'Sem observação'}{delta !== null && <> · <span className={delta > 0 ? 'text-[var(--success)]' : delta < 0 ? 'text-[var(--danger)]' : ''}>{delta > 0 ? '+' : ''}{formatWeight(delta)}</span></>}</span></span><span className="text-right"><strong>{row.weightKg === null ? 'Sem peso' : formatWeight(row.weightKg)}</strong><span className="block"><StatusBadge descriptor={weightMeasurementStatusDescriptor[row.status]} /></span>{row.sessionId && <Link className="text-xs font-semibold text-[var(--primary)] underline" to={`/pesos/${row.sessionId}`}>Abrir sessão</Link>}</span></div>;
    })}</ScrollArea>}
  </SectionCard>;
}
