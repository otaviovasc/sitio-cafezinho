import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { MilkingRoutine } from '../../../domain/herd';
import { formatLiters } from '../../../domain/format';
import { Button, InlineEmpty, ScrollArea, SectionCard, StatusBadge } from '../../components/ui';
import { FilterControls } from '../../components/FilterControls';
import { milkMeasurementStatusDescriptor } from '../../lib/status';
import { MilkMeasurementEditor, type MeasurementEditValue } from './MilkMeasurementEditor';
import { BulkRegisterAnimalsPanel } from './BulkRegisterAnimalsPanel';

export type Animal = { id: string; name: string | null; tagNumber: string | null; status: string; currentGroup: null | { id: string; name: string; milkingRoutine: MilkingRoutine } };
export type Measurement = {
  id: string; animalId: string | null; animalName: string | null; tagNumber: string | null; rawAnimalLabel: string; rawValueText: string | null;
  morningLiters: string | null; afternoonLiters: string | null; totalLiters: string | null; confidence: string; status: string; notes: string | null;
  issues: string[]; estimate: null | { morning: number; afternoon: number; description: string };
};

export function MilkSessionMeasurementList({ sessionId, sessionDate, measurements, animals, busy, editingMeasurementId, setEditingMeasurementId, setStatus, saveMeasurement, excludeMeasurement, reload, reloadAnimals }: {
  sessionId: string;
  sessionDate: string;
  measurements: Measurement[];
  animals: Animal[];
  busy: boolean;
  editingMeasurementId: string | null;
  setEditingMeasurementId: (id: string | null) => void;
  setStatus: (measurement: Measurement, status: string) => void | Promise<void>;
  saveMeasurement: (measurementId: string, value: MeasurementEditValue) => void | Promise<void>;
  excludeMeasurement: (row: Measurement) => void | Promise<void>;
  reload: (showLoading?: boolean) => Promise<void>;
  reloadAnimals: (showLoading?: boolean) => Promise<void>;
}) {
  const [showEstimate, setShowEstimate] = useState(true);
  const [measurementSearch, setMeasurementSearch] = useState('');
  const [measurementStatus, setMeasurementStatus] = useState('ALL');
  const [measurementIssue, setMeasurementIssue] = useState('ALL');
  const [showBulkRegistration, setShowBulkRegistration] = useState(false);
  const confirmed = measurements.filter((row) => row.status === 'CONFIRMED');
  const review = measurements.filter((row) => row.status === 'NEEDS_REVIEW');
  const unmatched = measurements.filter((row) => !row.animalId && row.status !== 'EXCLUDED' && row.rawAnimalLabel !== '[rótulo ilegível]');
  const ordered = [...review, ...confirmed, ...measurements.filter((row) => row.status === 'EXCLUDED')];
  const filteredMeasurements = ordered.filter((row) => (measurementStatus === 'ALL' || row.status === measurementStatus)
    && (measurementIssue === 'ALL' || (measurementIssue === 'ISSUES' && row.issues.length > 0) || (measurementIssue === 'UNMATCHED' && !row.animalId) || (measurementIssue === 'LOW_CONFIDENCE' && row.confidence === 'LOW') || (measurementIssue === 'MISSING_PERIOD' && (row.morningLiters === null || row.afternoonLiters === null)))
    && `${row.animalName ?? ''} ${row.tagNumber ?? ''} ${row.rawAnimalLabel}`.toLocaleLowerCase('pt-BR').includes(measurementSearch.toLocaleLowerCase('pt-BR')));
  return <SectionCard title="Medições" action={<div className="flex flex-wrap items-center justify-end gap-2">{unmatched.length > 0 && <Button variant="secondary" onClick={() => setShowBulkRegistration((value) => !value)}><Plus size={17} aria-hidden />Cadastrar sem vínculo ({unmatched.length})</Button>}<label className="flex min-h-11 items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={showEstimate} onChange={(event) => setShowEstimate(event.target.checked)} /> Mostrar estimativas</label></div>}>
    {showBulkRegistration && unmatched.length > 0 && <BulkRegisterAnimalsPanel sessionId={sessionId} sessionDate={sessionDate} rows={unmatched} onCancel={() => setShowBulkRegistration(false)} onDone={async () => { setShowBulkRegistration(false); await Promise.all([reload(), reloadAnimals()]); }} />}
    <FilterControls
      search={{ label: 'Buscar animal', value: measurementSearch, onChange: setMeasurementSearch, placeholder: 'Nome, brinco ou rótulo original' }}
      selects={[
        { label: 'Situação', value: measurementStatus, onChange: setMeasurementStatus, options: [{ value: 'ALL', label: 'Todas' }, { value: 'CONFIRMED', label: 'Confirmadas' }, { value: 'NEEDS_REVIEW', label: 'Aguardando revisão' }, { value: 'EXCLUDED', label: 'Excluídas' }] },
        { label: 'Inconsistência', value: measurementIssue, onChange: setMeasurementIssue, options: [{ value: 'ALL', label: 'Todas as linhas' }, { value: 'ISSUES', label: 'Com inconsistência' }, { value: 'UNMATCHED', label: 'Sem vínculo' }, { value: 'LOW_CONFIDENCE', label: 'Baixa confiança' }, { value: 'MISSING_PERIOD', label: 'Período ausente' }] },
      ]}
    />
    {!filteredMeasurements.length ? <InlineEmpty className="mt-4">Nenhuma medição encontrada com estes filtros.</InlineEmpty> : <ScrollArea label="Medições do controle" className="mt-4">{filteredMeasurements.map((row) => <div className="border-b border-[var(--border)] py-4 last:border-b-0" key={row.id}><div className="flex items-start justify-between gap-3"><div><strong>{row.animalName || (row.tagNumber ? `Brinco ${row.tagNumber}` : row.rawAnimalLabel)}</strong><p className="text-xs text-[var(--muted)]">Original: {row.rawAnimalLabel}{row.rawValueText ? ` · “${row.rawValueText}”` : ''}</p></div><div className="text-right"><strong className="text-lg">{row.totalLiters === null ? 'Sem valor legível' : formatLiters(row.totalLiters)}</strong><div><StatusBadge descriptor={milkMeasurementStatusDescriptor[row.status]} /></div></div></div>
      {row.morningLiters !== null && row.afternoonLiters !== null && <p className="mt-2 text-sm">Manhã {formatLiters(row.morningLiters)} · Tarde {formatLiters(row.afternoonLiters)}</p>}
      {row.morningLiters !== null && row.afternoonLiters === null && <p className="mt-2 text-sm">Manhã {formatLiters(row.morningLiters)} · Tarde sem medição</p>}
      {showEstimate && row.estimate && <div className="notice notice-warning mt-2"><strong>Estimativa — não foi medido separadamente</strong><br />Manhã {formatLiters(row.estimate.morning)} · Tarde {formatLiters(row.estimate.afternoon)}<br /><span className="text-xs">Método: {row.estimate.description}</span></div>}
      {row.issues.length > 0 && <div className="notice notice-warning mt-2"><ul className="list-disc pl-5">{row.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}{row.notes && <p className="mt-2 text-sm text-[var(--muted)]">{row.notes}</p>}
      {editingMeasurementId === row.id ? <MilkMeasurementEditor measurement={row} animals={animals ?? []} busy={busy} onSave={(value) => void saveMeasurement(row.id, value)} onCancel={() => setEditingMeasurementId(null)} /> : <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setEditingMeasurementId(row.id)}>Corrigir</Button>{row.status !== 'CONFIRMED' && row.totalLiters !== null && <Button aria-label={`Confirmar linha ${row.rawAnimalLabel} ${row.rawValueText ?? row.totalLiters}`} onClick={() => void setStatus(row, 'CONFIRMED')}>Confirmar</Button>}{row.status !== 'NEEDS_REVIEW' && row.totalLiters !== null && <Button variant="secondary" onClick={() => void setStatus(row, 'NEEDS_REVIEW')}>Revisar</Button>}{row.status !== 'EXCLUDED' && <Button variant="danger" onClick={() => void excludeMeasurement(row)}>Excluir dos totais</Button>}</div>}
    </div>)}</ScrollArea>}
  </SectionCard>;
}
