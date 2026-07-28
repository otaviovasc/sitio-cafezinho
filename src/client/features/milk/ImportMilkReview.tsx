import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MilkingRoutine } from '../../../domain/herd';
import { formatDate, formatLiters } from '../../../domain/format';
import { useToast } from '../../components/feedback-context';
import { ParsedDecimalInput } from '../../components/form-controls';
import { ReviewCard } from '../../components/review';
import { Button, ErrorState, Field, ScrollArea, SectionCard, Select, SkeletonList, StatCard, StatusBadge } from '../../components/ui';
import { FilterControls } from '../../components/FilterControls';
import { milkMeasurementStatusDescriptor } from '../../lib/status';
import { useResource } from '../../hooks/useResource';
import { api, ApiError, json } from '../../lib/api';
import { QuickAnimalForm } from '../animals/QuickAnimalForm';
import { ExistingMilkSessionConflict } from './ExistingMilkSessionConflict';
import { findMilkSessionByDate } from './findMilkSessionByDate';
import type { Animal } from './MilkSessionMeasurementList';

type Preview = {
  sessionDate: string;
  sourceMode: string;
  sessionIssues: string[];
  sessionWarnings?: string[];
  missingAnimals: Array<{ id: string; name: string | null; tagNumber: string | null }>;
  existingSession: null | {
    id: string;
    sessionDate: string;
    title: string | null;
    measurementCount: number;
    measurements: ExistingMeasurement[];
  };
  measurements: Array<{ rawAnimalLabel: string; rawValueText?: string | null; morningLiters: number | null; afternoonLiters: number | null; totalLiters: number | null; confidence: string; status: string; notes?: string | null; animalId: string | null; matchedAnimal: Animal | null; milkingRoutine: MilkingRoutine | null; mergeDecision: 'ADD' | 'KEEP_EXISTING' | 'REPLACE_EXISTING' | null; existingMeasurement: ExistingMeasurement | null; issues: string[] }>;
};

type ExistingMeasurement = {
  id: string;
  animalId: string | null;
  animalName: string | null;
  tagNumber: string | null;
  rawAnimalLabel: string | null;
  morningLiters: string | null;
  afternoonLiters: string | null;
  totalLiters: string | null;
  status: string | null;
};

/**
 * Revisão linha a linha de uma transcrição de controle individual (mesma UI
 * da antiga /producao/importar): matching exato por animal, cadastro inline
 * (QuickAnimalForm), decisões de merge com o controle existente e linhas sem
 * vínculo/excluídas preservadas. A confirmação grava pelo
 * POST /api/import/milk-session — que também confirma a ação proposta de
 * origem (sourceCaptureId/sourceActionId). Usada pela página de importação
 * (fallback) e pela folha da mangueira em modo revisão.
 */
export function ImportMilkReview({ prefillJson, sourceCaptureId, sourceActionId, onSaved }: {
  prefillJson: string;
  sourceCaptureId?: string;
  sourceActionId?: string;
  onSaved: (sessionId: string, merged: boolean) => void;
}) {
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewFilter, setReviewFilter] = useState('ISSUES');
  const [registeringRowIndex, setRegisteringRowIndex] = useState<number | null>(null);
  const [existingSession, setExistingSession] = useState<{ id: string; sessionDate: string } | null>(null);
  const { data: animals, reload: reloadAnimals } = useResource<Animal[]>(preview ? `/api/animals?onDate=${preview.sessionDate}` : '/api/animals');
  const navigate = useNavigate();

  const validate = useCallback(async (raw: string) => {
    setBusy(true); setError(''); setExistingSession(null);
    try { setPreview(await api<Preview>('/api/import/milk-session/validate', json('POST', { content: raw }))); toast('Transcrição carregada. Revise cada linha antes de importar.'); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Não foi possível validar a transcrição.'); }
    finally { setBusy(false); }
  }, [toast]);

  useEffect(() => {
    void validate(prefillJson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(index: number, values: Partial<Preview['measurements'][number]>) {
    if (!preview) return;
    setPreview({ ...preview, measurements: preview.measurements.map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row) });
  }
  function updatePeriod(index: number, period: 'morningLiters' | 'afternoonLiters', value: number | null) {
    if (!preview) return;
    const row = preview.measurements[index];
    const morning = period === 'morningLiters' ? value : row.morningLiters;
    const afternoon = period === 'afternoonLiters' ? value : row.afternoonLiters;
    update(index, { [period]: value, totalLiters: morning === null && afternoon === null ? null : (morning ?? 0) + (afternoon ?? 0) });
  }
  function selectAnimal(index: number, animalId: string | null) {
    if (!preview) return;
    const selected = animals?.find((animal) => animal.id === animalId) ?? null;
    const existingMeasurement = animalId
      ? preview.existingSession?.measurements.find((measurement) => measurement.animalId === animalId && measurement.status !== 'EXCLUDED') ?? null
      : null;
    const row = preview.measurements[index];
    const issues = row.issues.filter((issue) => issue !== 'Animal não encontrado por nome, brinco ou alias exato.'
      && issue !== 'Este animal já possui uma medição ativa no controle desta data.');
    if (existingMeasurement) issues.push('Este animal já possui uma medição ativa no controle desta data.');
    update(index, {
      animalId,
      matchedAnimal: selected,
      existingMeasurement,
      mergeDecision: existingMeasurement ? null : 'ADD',
      status: row.status === 'EXCLUDED' ? 'EXCLUDED' : 'NEEDS_REVIEW',
      issues,
    });
  }
  function decideMerge(index: number, mergeDecision: 'KEEP_EXISTING' | 'REPLACE_EXISTING') {
    update(index, { mergeDecision, status: 'CONFIRMED' });
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const created = await api<{ id: string; merged?: boolean }>('/api/import/milk-session', json('POST', {
        sessionDate: preview.sessionDate,
        inputMode: preview.sourceMode === 'UNKNOWN' ? 'MIXED' : preview.sourceMode,
        title: 'Controle importado',
        sourceCaptureId,
        sourceActionId,
        measurements: preview.measurements.map(({ matchedAnimal: _matchedAnimal, milkingRoutine: _milkingRoutine, issues: _issues, existingMeasurement: _existingMeasurement, ...measurement }) => measurement),
      }));
      toast(created.merged ? 'Medições adicionadas ao controle existente' : 'Controle individual importado');
      onSaved(created.id, Boolean(created.merged));
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'SESSION_DATE_EXISTS') {
        try {
          const session = await findMilkSessionByDate(preview.sessionDate);
          if (session) {
            setExistingSession(session);
            return;
          }
        } catch {
          // Keep the original conflict message if the lookup also fails.
        }
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível importar.');
    }
    finally { setBusy(false); }
  }

  if (busy && !preview) return <SkeletonList rows={5} />;
  if (!preview) return <div className="grid gap-5">{error && <ErrorState message={error} />}</div>;

  const visibleRows = preview.measurements.map((row, index) => ({ row, index })).filter(({ row }) => {
    const matchesSearch = `${row.rawAnimalLabel} ${row.matchedAnimal?.name ?? ''} ${row.matchedAnimal?.tagNumber ?? ''}`.toLocaleLowerCase('pt-BR').includes(reviewSearch.toLocaleLowerCase('pt-BR'));
    const matchesFilter = reviewFilter === 'ALL' || (reviewFilter === 'ISSUES' && (row.issues.length > 0 || row.status === 'NEEDS_REVIEW')) || row.status === reviewFilter;
    return matchesSearch && matchesFilter;
  });
  const invalidMeasurementCount = preview.measurements.filter((row) => row.status !== 'EXCLUDED' && row.totalLiters === null).length;
  const unresolvedMergeCount = preview.measurements.filter((row) => row.status !== 'EXCLUDED' && row.existingMeasurement && !row.mergeDecision).length;

  return <div className="grid gap-5">
    {error && <ErrorState message={error} />}
    {existingSession && <ExistingMilkSessionConflict
      session={existingSession}
      onOpen={() => navigate(`/producao/${existingSession.id}`)}
      onCancel={() => setExistingSession(null)}
    />}
    <SectionCard title="Revisar o controle">
      {preview.existingSession && <div className="notice notice-info mb-4">
        <strong>Este controle diário já existe</strong>
        <p className="mt-1 text-sm">As linhas revisadas serão adicionadas ao controle de {formatDate(preview.sessionDate)}, que já tem {preview.existingSession.measurementCount} medição(ões) ativa(s). Nada será apagado silenciosamente.</p>
        <Button className="mt-2" variant="secondary" onClick={() => navigate(`/producao/${preview.existingSession?.id}`)}>Abrir controle existente</Button>
      </div>}
      <div className="mb-4 grid grid-cols-3 gap-3"><StatCard label="Confirmadas" value={preview.measurements.filter((row) => row.status === 'CONFIRMED').length} /><StatCard label="A revisar" value={preview.measurements.filter((row) => row.status === 'NEEDS_REVIEW').length} /><StatCard label="Sem medição" value={preview.missingAnimals.length} /></div>
      {preview.sessionIssues.length > 0 && <div className="notice notice-error mb-4"><strong>Corrija antes de salvar</strong><ul className="mt-1 list-disc pl-5">{preview.sessionIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      {(preview.sessionWarnings?.length ?? 0) > 0 && <div className="notice notice-warning mb-4"><strong>Confira antes de salvar</strong><ul className="mt-1 list-disc pl-5">{preview.sessionWarnings?.map((issue) => <li key={issue}>{issue}</li>)}</ul>{preview.missingAnimals.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold">Ver vacas sem medição vinculada</summary><p className="text-xs">{preview.missingAnimals.map((animal) => animal.name || `Brinco ${animal.tagNumber}`).join(', ')}.</p></details>}<p className="mt-2 text-xs">Isso não impede salvar: o controle individual pode ser pontual e não registra ausência nem produção zero.</p></div>}
      <FilterControls search={{ value: reviewSearch, onChange: setReviewSearch, placeholder: 'Nome, brinco ou original' }} selects={[{ label: 'Mostrar', value: reviewFilter, onChange: setReviewFilter, options: [{ value: 'ISSUES', label: 'Inconsistências primeiro' }, { value: 'ALL', label: 'Todas' }, { value: 'NEEDS_REVIEW', label: 'Aguardando revisão' }, { value: 'CONFIRMED', label: 'Confirmadas' }, { value: 'EXCLUDED', label: 'Excluídas' }] }] } />
      <ScrollArea label="Linhas da revisão do controle" className="mt-4 max-h-[46rem]">
        <div className="grid gap-3">{visibleRows.map(({ row, index }) => {
          const selectedAnimal = animals?.find((animal) => animal.id === row.animalId) ?? row.matchedAnimal;
          const hasMergeConflict = row.status !== 'EXCLUDED' && Boolean(row.existingMeasurement);
          return <ReviewCard
            key={`${row.rawAnimalLabel}-${index}`}
            accent={row.status === 'EXCLUDED' ? 'dismissed' : row.status === 'CONFIRMED' ? 'ok' : 'action'}
            title={row.rawAnimalLabel}
            subtitle={`Linha ${index + 1} · original preservado${row.rawValueText ? ` · “${row.rawValueText}”` : ''}`}
            value={row.totalLiters === null ? 'Sem valor' : formatLiters(row.totalLiters)}
            badge={<StatusBadge descriptor={milkMeasurementStatusDescriptor[row.status] ?? milkMeasurementStatusDescriptor.NEEDS_REVIEW} />}
            issues={row.issues}
            actions={<>
              {hasMergeConflict ? <>
                <Button variant={row.mergeDecision === 'KEEP_EXISTING' ? 'primary' : 'secondary'} onClick={() => decideMerge(index, 'KEEP_EXISTING')}>Manter existente</Button>
                <Button variant={row.mergeDecision === 'REPLACE_EXISTING' ? 'primary' : 'secondary'} onClick={() => decideMerge(index, 'REPLACE_EXISTING')}>Usar nova medição</Button>
              </> : <>
                {row.status === 'NEEDS_REVIEW' && row.animalId && row.totalLiters !== null && <Button onClick={() => update(index, { status: 'CONFIRMED' })}>Confirmar</Button>}
                {row.status !== 'EXCLUDED' && !row.animalId && <Button onClick={() => setRegisteringRowIndex(index)}>Cadastrar como nova</Button>}
                {row.status === 'CONFIRMED' && <Button variant="secondary" onClick={() => update(index, { status: 'NEEDS_REVIEW' })}>Revisar</Button>}
                {row.status === 'EXCLUDED' && <Button variant="secondary" onClick={() => update(index, { status: 'NEEDS_REVIEW' })}>Restaurar para revisão</Button>}
              </>}
              {row.status !== 'EXCLUDED' && <Button variant="danger" onClick={() => update(index, { status: 'EXCLUDED', mergeDecision: 'ADD' })}>Excluir</Button>}
            </>}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Animal vinculado" hint={selectedAnimal?.currentGroup ? `Lote na data: ${selectedAnimal.currentGroup.name}` : row.animalId ? 'Sem lote na data' : 'Selecione ou cadastre abaixo'}>
                <Select value={row.animalId || ''} onChange={(event) => selectAnimal(index, event.target.value || null)}>
                  <option value="">Sem vínculo</option>
                  {animals?.map((animal) => <option key={animal.id} value={animal.id}>{animal.name || `Brinco ${animal.tagNumber}`}{animal.currentGroup ? ` · ${animal.currentGroup.name}` : ''}</option>)}
                </Select>
              </Field>
              <Field label="Manhã (L)"><ParsedDecimalInput suffix="L" value={row.morningLiters} onValueChange={(value) => updatePeriod(index, 'morningLiters', value)} /></Field>
              <Field label="Tarde (L)"><ParsedDecimalInput suffix="L" value={row.afternoonLiters} onValueChange={(value) => updatePeriod(index, 'afternoonLiters', value)} /></Field>
              <Field label="Total (L)" hint="Recalculado pela manhã e tarde" error={row.status !== 'EXCLUDED' && row.totalLiters === null ? 'Informe manhã ou tarde, ou exclua a linha.' : undefined}><ParsedDecimalInput suffix="L" value={row.totalLiters} onValueChange={() => undefined} readOnly aria-readonly /></Field>
            </div>
            {row.existingMeasurement && row.status !== 'EXCLUDED' && <div className="notice notice-warning mt-3">
              <strong>Medição já registrada para este animal</strong>
              <p className="mt-1 text-sm">Existente: {row.existingMeasurement.totalLiters === null ? 'sem total' : formatLiters(row.existingMeasurement.totalLiters)}
                {row.existingMeasurement.morningLiters !== null ? ` · manhã ${formatLiters(row.existingMeasurement.morningLiters)}` : ''}
                {row.existingMeasurement.afternoonLiters !== null ? ` · tarde ${formatLiters(row.existingMeasurement.afternoonLiters)}` : ''}.</p>
              <p className="mt-1 text-xs">Escolha uma das ações abaixo. “Usar nova medição” preserva a anterior como excluída.</p>
            </div>}
            {registeringRowIndex === index && <div className="mt-3"><QuickAnimalForm
              key={`${index}-${row.rawAnimalLabel}`}
              initialDate={preview.sessionDate}
              initialName={row.rawAnimalLabel}
              onCancel={() => setRegisteringRowIndex(null)}
              onCreated={async (animal) => {
                update(index, {
                  animalId: animal.id,
                  matchedAnimal: { ...animal, currentGroup: null },
                  existingMeasurement: null,
                  mergeDecision: 'ADD',
                  status: 'NEEDS_REVIEW',
                  issues: row.issues.filter((issue) => issue !== 'Animal não encontrado por nome, brinco ou alias exato.'),
                });
                await reloadAnimals(false);
                setRegisteringRowIndex(null);
              }}
            /></div>}
            {row.notes && <p className="mt-2 text-xs text-[var(--muted)]">{row.notes}</p>}
          </ReviewCard>;
        })}</div>
      </ScrollArea>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-xs ${invalidMeasurementCount || unresolvedMergeCount ? 'font-semibold text-[var(--danger)]' : 'text-[var(--muted)]'}`}>
          {invalidMeasurementCount
            ? `${invalidMeasurementCount} linha(s) precisa(m) de um valor ou deve(m) ser excluída(s).`
            : unresolvedMergeCount
              ? `${unresolvedMergeCount} animal(is) já medido(s) precisa(m) de uma decisão.`
              : 'Confirme em um toque as linhas revisadas. Linhas aguardando revisão ficam fora dos totais.'}
        </p>
        <Button className="w-full sm:w-auto" disabled={busy || preview.sessionIssues.length > 0 || invalidMeasurementCount > 0 || unresolvedMergeCount > 0} onClick={() => void confirm()}>{busy ? 'Salvando…' : preview.existingSession ? 'Adicionar ao controle existente' : 'Salvar controle revisado'}</Button>
      </div>
    </SectionCard>
  </div>;
}
