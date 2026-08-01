import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MilkingRoutine } from '../../../domain/herd';
import { canRegisterAnimalFromMeasurement } from '../../../domain/animal-registration';
import { formatDate, formatLiters } from '../../../domain/format';
import { useToast } from '../../components/feedback-context';
import { ParsedDecimalInput } from '../../components/form-controls';
import { ReviewCard } from '../../components/review';
import { Button, ErrorState, Field, Input, SectionCard, Select, SkeletonList, StatCard, StatusBadge, SubmitBar } from '../../components/ui';
import { FilterControls } from '../../components/FilterControls';
import { milkMeasurementStatusDescriptor } from '../../lib/status';
import { useResource } from '../../hooks/useResource';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, ApiError, json } from '../../lib/api';
import { BulkRegisterFromLabels, type BulkCreatedAnimal } from '../animals/BulkRegisterFromLabels';
import type { HerdGroup } from '../animals/GroupPicker';
import { QuickAnimalForm } from '../animals/QuickAnimalForm';
import { ExistingMilkSessionConflict } from './ExistingMilkSessionConflict';
import { findMilkSessionByDate } from './findMilkSessionByDate';
import type { Animal } from './MilkSessionMeasurementList';

type Preview = {
  sessionDate: string;
  herdGroupId: string | null;
  herdGroupName?: string | null;
  sourceMode: string;
  period?: 'MORNING' | 'AFTERNOON' | null;
  sourceDocumentOrdinals?: number[];
  crossGroupAnimalLabels?: string[];
  metadataReview?: { dateRequired?: boolean; groupRequired?: boolean; periodRequired?: boolean };
  requiresDateReview?: boolean;
  requiresGroupReview?: boolean;
  requiresPeriodReview?: boolean;
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
  measurements: Array<{ rawAnimalLabel: string; rawValueText?: string | null; morningLiters: number | null; afternoonLiters: number | null; totalLiters: number | null; confidence: string; status: string; notes?: string | null; animalId: string | null; matchedAnimal: Animal | null; milkingRoutine: MilkingRoutine | null; mergeDecision: 'ADD' | 'COMPLETE_EXISTING' | 'KEEP_EXISTING' | 'REPLACE_EXISTING' | null; existingMeasurement: ExistingMeasurement | null; issues: string[]; sources?: Array<Record<string, unknown>>; sourceDocumentOrdinals?: number[]; groupChangeProposal?: GroupChangeProposal | null }>;
};

type GroupChangeProposal = {
  animalId: string;
  animalName: string | null;
  fromGroupId: string | null;
  fromGroupName: string | null;
  toGroupId: string;
  toGroupName: string;
  changedOn: string;
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
 * da antiga /producao/importar): matching exato por animal, cadastro em massa
 * das linhas sem vínculo (BulkRegisterFromLabels, um lote para todas e rematch
 * automático) ou individual (QuickAnimalForm, que memoriza o último lote),
 * decisões de merge com o controle existente e linhas sem
 * vínculo/excluídas preservadas. A confirmação grava pelo
 * POST /api/import/milk-session — que também confirma a ação proposta de
 * origem (sourceCaptureId/sourceActionId). Usada pela página de importação
 * (fallback) e pela folha da mangueira em modo revisão.
 */
export function ImportMilkReview({ prefillJson, sourceCaptureId, sourceActionId, sourceActions, onSaved }: {
  prefillJson: string;
  sourceCaptureId?: string;
  sourceActionId?: string;
  sourceActions?: Array<{ captureId: string; actionId: string }>;
  onSaved: (sessionId: string, merged: boolean) => void;
}) {
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewFilter, setReviewFilter] = useState('ISSUES');
  const [registeringRowIndex, setRegisteringRowIndex] = useState<number | null>(null);
  const [showBulkRegister, setShowBulkRegister] = useState(false);
  const [lastGroupId, setLastGroupId] = useState('');
  const [existingSession, setExistingSession] = useState<{ id: string; sessionDate: string } | null>(null);
  const [groupChangeDecisions, setGroupChangeDecisions] = useState<Record<string, boolean>>({});
  const [metadataConfirmed, setMetadataConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { data: animals, reload: reloadAnimals } = useResource<Animal[]>(preview ? `/api/animals?onDate=${preview.sessionDate}` : '/api/animals');
  const { data: groups = [] } = useResource<HerdGroup[]>('/api/herd-groups');
  const navigate = useNavigate();
  useUnsavedGuard(dirty);

  // Lote sugerido para novos cadastros: o último usado nesta revisão ou o lote
  // mais frequente entre os animais já vinculados (o lote de ordenha do controle).
  const suggestedGroupId = useMemo(() => {
    if (lastGroupId) return lastGroupId;
    const counts = new Map<string, number>();
    for (const row of preview?.measurements ?? []) {
      const groupId = (row.animalId ? animals?.find((animal) => animal.id === row.animalId)?.currentGroup?.id : null) ?? row.matchedAnimal?.currentGroup?.id ?? null;
      if (groupId) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }, [lastGroupId, preview, animals]);

  const validate = useCallback(async (raw: string) => {
    setBusy(true); setError(''); setExistingSession(null);
    try {
      const validated = await api<Preview>('/api/import/milk-session/validate', json('POST', { content: raw }));
      setPreview(validated);
      setMetadataConfirmed(!validated.metadataReview?.dateRequired && !validated.metadataReview?.groupRequired && !validated.metadataReview?.periodRequired);
      setGroupChangeDecisions({});
      setDirty(false);
      toast('Transcrição carregada. Revise cada linha antes de importar.');
    }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Não foi possível validar a transcrição.'); }
    finally { setBusy(false); }
  }, [toast]);

  useEffect(() => {
    void validate(prefillJson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(index: number, values: Partial<Preview['measurements'][number]>) {
    if (!preview) return;
    setDirty(true);
    setPreview({ ...preview, measurements: preview.measurements.map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row) });
  }
  function updateMetadata(values: Partial<Pick<Preview, 'sessionDate' | 'herdGroupId' | 'herdGroupName' | 'period'>>) {
    if (!preview) return;
    setDirty(true);
    setMetadataConfirmed(false);
    const sessionIssues = values.herdGroupId
      ? preview.sessionIssues.filter((issue) => !issue.includes('não foi identificado') && issue !== 'O lote informado não existe mais.')
      : preview.sessionIssues;
    setPreview({ ...preview, ...values, sessionIssues });
  }
  function updateGlobalPeriod(period: Preview['period']) {
    if (!preview) return;
    setDirty(true);
    setMetadataConfirmed(false);
    const measurements = preview.measurements.map((row) => {
      if (!period || row.morningLiters !== null || row.afternoonLiters !== null || row.totalLiters === null) return row;
      return period === 'MORNING'
        ? { ...row, morningLiters: row.totalLiters }
        : { ...row, afternoonLiters: row.totalLiters };
    });
    setPreview({
      ...preview,
      period,
      sourceMode: period ? 'SEPARATE_MORNING_AFTERNOON' : preview.sourceMode,
      measurements,
      sessionIssues: period
        ? preview.sessionIssues.filter((issue) => issue !== 'O controle novo deve separar manhã e tarde.')
        : preview.sessionIssues,
    });
  }
  async function confirmMetadata() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const content = JSON.stringify({
        sessionDate: preview.sessionDate,
        herdGroupId: preview.herdGroupId,
        herdGroupLabel: preview.herdGroupName ?? null,
        sourceMode: preview.sourceMode,
        period: preview.period,
        metadataReview: preview.metadataReview,
        sourceDocumentOrdinals: preview.sourceDocumentOrdinals,
        crossGroupAnimalLabels: preview.crossGroupAnimalLabels,
        measurements: preview.measurements.map((row) => ({
          rawAnimalLabel: row.rawAnimalLabel,
          rawValueText: row.rawValueText ?? null,
          morningLiters: row.morningLiters,
          afternoonLiters: row.afternoonLiters,
          totalLiters: row.totalLiters,
          confidence: row.confidence,
          notes: row.notes ?? null,
          excluded: row.status === 'EXCLUDED',
          sources: row.sources,
          sourceDocumentOrdinals: row.sourceDocumentOrdinals,
        })),
      });
      const validated = await api<Preview>('/api/import/milk-session/validate', json('POST', { content }));
      setPreview(validated);
      setExistingSession(null);
      setGroupChangeDecisions({});
      setMetadataConfirmed(true);
      setDirty(true);
      toast('Contexto confirmado. Vínculos e mudanças de lote foram recalculados.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o contexto.');
    } finally {
      setBusy(false);
    }
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
    const canCompleteExisting = Boolean(existingMeasurement)
      && !(row.morningLiters !== null && existingMeasurement?.morningLiters !== null)
      && !(row.afternoonLiters !== null && existingMeasurement?.afternoonLiters !== null);
    if (existingMeasurement && !canCompleteExisting) issues.push('Este animal já possui uma medição ativa no controle desta data.');
    update(index, {
      animalId,
      matchedAnimal: selected,
      existingMeasurement,
      mergeDecision: existingMeasurement ? canCompleteExisting ? 'COMPLETE_EXISTING' : null : 'ADD',
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
        herdGroupId: preview.herdGroupId,
        sourceCaptureId,
        sourceActionId,
        sourceActions,
        groupChangeDecisions: groupChangeProposals.map((proposal) => ({
          animalId: proposal.animalId,
          approved: groupChangeDecisions[proposal.animalId],
        })),
        measurements: preview.measurements.map(({ matchedAnimal: _matchedAnimal, milkingRoutine: _milkingRoutine, issues: _issues, existingMeasurement: _existingMeasurement, ...measurement }) => measurement),
      }));
      toast(created.merged ? 'Medições adicionadas ao controle existente' : 'Controle individual importado');
      setDirty(false);
      onSaved(created.id, Boolean(created.merged));
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'SESSION_DATE_EXISTS') {
        try {
          const session = await findMilkSessionByDate(preview.sessionDate, preview.herdGroupId);
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

  async function handleBulkCreated(created: BulkCreatedAnimal[], group: HerdGroup | null) {
    if (!preview) return;
    const createdByIndex = new Map(created.map((item) => [item.index, item.animal]));
    const remaining = preview.measurements.filter((row, index) => !createdByIndex.has(index) && canRegisterAnimalFromMeasurement(row)).length;
    setPreview({
      ...preview,
      measurements: preview.measurements.map((row, index) => {
        const animal = createdByIndex.get(index);
        if (!animal) return row;
        return {
          ...row,
          animalId: animal.id,
          matchedAnimal: { id: animal.id, name: animal.name, tagNumber: animal.tagNumber, status: animal.status, currentGroup: group ? { id: group.id, name: group.name, milkingRoutine: group.milkingRoutine } : null },
          existingMeasurement: null,
          mergeDecision: 'ADD' as const,
          status: 'NEEDS_REVIEW',
          issues: row.issues.filter((issue) => issue !== 'Animal não encontrado por nome, brinco ou alias exato.'),
        };
      }),
    });
    if (group) setLastGroupId(group.id);
    setShowBulkRegister(false);
    await reloadAnimals(false);
    toast(`${created.length} ${created.length === 1 ? 'vaca cadastrada e vinculada' : 'vacas cadastradas e vinculadas'}${remaining ? ` · restam ${remaining} sem vínculo` : ''}`);
  }

  if (busy && !preview) return <SkeletonList rows={5} />;
  if (!preview) return <div className="grid gap-5">{error && <ErrorState message={error} />}</div>;

  const visibleRows = preview.measurements.map((row, index) => ({ row, index })).filter(({ row }) => {
    const matchesSearch = `${row.rawAnimalLabel} ${row.matchedAnimal?.name ?? ''} ${row.matchedAnimal?.tagNumber ?? ''}`.toLocaleLowerCase('pt-BR').includes(reviewSearch.toLocaleLowerCase('pt-BR'));
    const matchesFilter = reviewFilter === 'ALL' || (reviewFilter === 'ISSUES' && (row.issues.length > 0 || row.status === 'NEEDS_REVIEW')) || (reviewFilter === 'UNMATCHED' && !row.animalId && row.status !== 'EXCLUDED') || row.status === reviewFilter;
    return matchesSearch && matchesFilter;
  });
  const bulkCandidates = preview.measurements.map((row, index) => ({ ...row, index })).filter(canRegisterAnimalFromMeasurement);
  const invalidMeasurementCount = preview.measurements.filter((row) => row.status !== 'EXCLUDED' && row.totalLiters === null).length;
  const unresolvedMergeCount = preview.measurements.filter((row) => row.status !== 'EXCLUDED' && row.existingMeasurement && !row.mergeDecision).length;
  const automaticMergeCount = preview.measurements.filter((row) => row.status !== 'EXCLUDED' && row.mergeDecision === 'COMPLETE_EXISTING').length;
  const groupChangeProposals = [...new Map(preview.measurements.flatMap((row) => row.groupChangeProposal ? [[row.groupChangeProposal.animalId, row.groupChangeProposal] as const] : [])).values()];
  const unresolvedGroupChangeCount = groupChangeProposals.filter((proposal) => groupChangeDecisions[proposal.animalId] === undefined).length;
  const dateRequired = preview.metadataReview?.dateRequired ?? preview.requiresDateReview ?? !preview.sessionDate;
  const groupRequired = preview.metadataReview?.groupRequired ?? preview.requiresGroupReview ?? !preview.herdGroupId;
  const periodRequired = preview.metadataReview?.periodRequired ?? preview.requiresPeriodReview ?? false;
  const metadataValuesInvalid = !preview.sessionDate || !preview.herdGroupId || (periodRequired && !preview.period);
  const metadataInvalid = metadataValuesInvalid || !metadataConfirmed;

  return <div className="grid gap-5">
    {error && <ErrorState message={error} />}
    {existingSession && <ExistingMilkSessionConflict
      session={existingSession}
      onOpen={() => navigate(`/producao/${existingSession.id}`)}
      onCancel={() => setExistingSession(null)}
    />}
    <SectionCard title="Revisar o controle">
      <div className="review-context-fields">
        <Field label="Data do controle" hint={dateRequired ? 'Confirme a data encontrada nas fotos.' : 'Data encontrada no contexto.'} error={!preview.sessionDate ? 'Informe a data.' : undefined}>
          <Input type="date" value={preview.sessionDate} required onChange={(event) => updateMetadata({ sessionDate: event.target.value })} />
        </Field>
        <Field label="Lote" hint={groupRequired ? 'Escolha o lote destas medições.' : 'Lote encontrado no contexto.'} error={!preview.herdGroupId ? 'Escolha o lote.' : undefined}>
          <Select value={preview.herdGroupId ?? ''} required onChange={(event) => {
            const group = (groups ?? []).find((item) => item.id === event.target.value);
            updateMetadata({ herdGroupId: event.target.value || null, herdGroupName: group?.name ?? null });
          }}>
            <option value="">Selecione o lote</option>
            {(groups ?? []).filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </Select>
        </Field>
        {(periodRequired || preview.period !== undefined) && <Field label="Período destas fotos" hint="Não presumimos manhã ou tarde." error={periodRequired && !preview.period ? 'Escolha o período.' : undefined}>
          <Select value={preview.period ?? ''} required={periodRequired} onChange={(event) => updateGlobalPeriod((event.target.value || null) as Preview['period'])}>
            <option value="">Selecione</option>
            <option value="MORNING">Manhã</option>
            <option value="AFTERNOON">Tarde</option>
          </Select>
        </Field>}
        {(!metadataConfirmed || dateRequired || groupRequired || periodRequired) && <div className="review-context-confirm">
          <Button type="button" variant={metadataConfirmed ? 'secondary' : 'primary'} disabled={metadataValuesInvalid || busy} onClick={() => void confirmMetadata()}>
            {busy ? 'Recalculando…' : metadataConfirmed ? 'Revalidar contexto' : 'Confirmar contexto'}
          </Button>
          <small>{metadataConfirmed ? 'Data, lote e período conferidos.' : 'Confira os campos acima antes das medições.'}</small>
        </div>}
      </div>
      {preview.existingSession && <div className="notice notice-info mb-4">
        <strong>Este controle do lote já existe</strong>
        <p className="mt-1 text-sm">As novas linhas ou períodos serão combinados com o controle de {formatDate(preview.sessionDate)}, que já tem {preview.existingSession.measurementCount} medição(ões) ativa(s). Nada será apagado silenciosamente.</p>
        <Button className="mt-2" variant="secondary" onClick={() => navigate(`/producao/${preview.existingSession?.id}`)}>Abrir controle existente</Button>
      </div>}
      {automaticMergeCount > 0 && <div className="notice notice-info mb-4">
        <strong>Períodos combinados automaticamente</strong>
        <p className="mt-1 text-sm">{automaticMergeCount} {automaticMergeCount === 1 ? 'animal recebeu' : 'animais receberam'} o período que faltava, sem substituir o valor já registrado.</p>
      </div>}
      <div className="mb-4 grid grid-cols-3 gap-3"><StatCard label="Confirmadas" value={preview.measurements.filter((row) => row.status === 'CONFIRMED').length} /><StatCard label="A revisar" value={preview.measurements.filter((row) => row.status === 'NEEDS_REVIEW').length} /><StatCard label="Sem medição" value={preview.missingAnimals.length} /></div>
      {preview.sessionIssues.length > 0 && <div className="notice notice-error mb-4"><strong>Corrija antes de salvar</strong><ul className="mt-1 list-disc pl-5">{preview.sessionIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      {(preview.sessionWarnings?.length ?? 0) > 0 && <div className="notice notice-warning mb-4"><strong>Confira antes de salvar</strong><ul className="mt-1 list-disc pl-5">{preview.sessionWarnings?.map((issue) => <li key={issue}>{issue}</li>)}</ul>{preview.missingAnimals.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold">Ver vacas sem medição vinculada</summary><p className="text-xs">{preview.missingAnimals.map((animal) => animal.name || `Brinco ${animal.tagNumber}`).join(', ')}.</p></details>}<p className="mt-2 text-xs">Isso não impede salvar: o controle individual pode ser pontual e não registra ausência nem produção zero.</p></div>}
      <FilterControls search={{ value: reviewSearch, onChange: setReviewSearch, placeholder: 'Nome, brinco ou original' }} selects={[{ label: 'Mostrar', value: reviewFilter, onChange: setReviewFilter, options: [{ value: 'ISSUES', label: 'Inconsistências primeiro' }, { value: 'ALL', label: 'Todas' }, { value: 'NEEDS_REVIEW', label: 'Aguardando revisão' }, { value: 'UNMATCHED', label: 'Sem vínculo' }, { value: 'CONFIRMED', label: 'Confirmadas' }, { value: 'EXCLUDED', label: 'Excluídas' }] }] } />
      {bulkCandidates.length > 0 && !showBulkRegister && <div className="notice notice-info mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm"><strong>{bulkCandidates.length} {bulkCandidates.length === 1 ? 'linha sem vínculo' : 'linhas sem vínculo'}</strong> — cadastre todas de uma vez com um único lote, em vez de uma por uma.</p>
        <Button data-testid="import-bulk-register" onClick={() => setShowBulkRegister(true)}>Cadastrar {bulkCandidates.length} {bulkCandidates.length === 1 ? 'vaca' : 'vacas'} sem vínculo</Button>
      </div>}
      {showBulkRegister && <div className="mt-4"><BulkRegisterFromLabels
        date={preview.sessionDate}
        rows={bulkCandidates}
        fixedStatus="LACTATING"
        defaultGroupId={suggestedGroupId}
        testIdPrefix="import-bulk"
        onCancel={() => setShowBulkRegister(false)}
        onCreated={handleBulkCreated}
      /></div>}
      <div className="mt-4 grid gap-3" aria-label="Linhas da revisão do controle">{visibleRows.map(({ row, index }) => {
          const selectedAnimal = animals?.find((animal) => animal.id === row.animalId) ?? row.matchedAnimal;
          const completesExisting = row.status !== 'EXCLUDED' && row.mergeDecision === 'COMPLETE_EXISTING';
          const hasMergeConflict = row.status !== 'EXCLUDED' && Boolean(row.existingMeasurement) && !completesExisting;
          return <ReviewCard
            key={`${row.rawAnimalLabel}-${index}`}
            accent={row.status === 'EXCLUDED' ? 'dismissed' : row.status === 'CONFIRMED' ? 'ok' : 'action'}
            title={row.rawAnimalLabel}
            subtitle={`Linha ${index + 1}${(row.sourceDocumentOrdinals ?? []).length ? ` · Foto ${(row.sourceDocumentOrdinals ?? []).join(' e Foto ')}` : ''} · original preservado${row.rawValueText ? ` · “${row.rawValueText}”` : ''}`}
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
            {row.existingMeasurement && row.status !== 'EXCLUDED' && <div className={`notice ${completesExisting ? 'notice-info' : 'notice-warning'} mt-3`}>
              <strong>{completesExisting ? 'Períodos combinados automaticamente' : 'Medição já registrada para este animal'}</strong>
              <p className="mt-1 text-sm">Existente: {row.existingMeasurement.totalLiters === null ? 'sem total' : formatLiters(row.existingMeasurement.totalLiters)}
                {row.existingMeasurement.morningLiters !== null ? ` · manhã ${formatLiters(row.existingMeasurement.morningLiters)}` : ''}
                {row.existingMeasurement.afternoonLiters !== null ? ` · tarde ${formatLiters(row.existingMeasurement.afternoonLiters)}` : ''}.</p>
              <p className="mt-1 text-xs">{completesExisting
                ? 'O período novo será acrescentado à medição deste animal; a origem de cada valor continuará preservada.'
                : 'Escolha uma das ações abaixo. “Usar nova medição” preserva a anterior como excluída.'}</p>
            </div>}
            {registeringRowIndex === index && <div className="mt-3"><QuickAnimalForm
              key={`${index}-${row.rawAnimalLabel}`}
              initialDate={preview.sessionDate}
              initialName={row.rawAnimalLabel}
              initialGroupId={suggestedGroupId}
              onCancel={() => setRegisteringRowIndex(null)}
              onCreated={async (animal, context) => {
                update(index, {
                  animalId: animal.id,
                  matchedAnimal: { ...animal, currentGroup: null },
                  existingMeasurement: null,
                  mergeDecision: 'ADD',
                  status: 'NEEDS_REVIEW',
                  issues: row.issues.filter((issue) => issue !== 'Animal não encontrado por nome, brinco ou alias exato.'),
                });
                if (context.groupId) setLastGroupId(context.groupId);
                await reloadAnimals(false);
                setRegisteringRowIndex(null);
              }}
            /></div>}
            {row.notes && <p className="mt-2 text-xs text-[var(--muted)]">{row.notes}</p>}
          </ReviewCard>;
        })}</div>
      {groupChangeProposals.length > 0 && <section className="review-group-changes" aria-labelledby="group-change-title">
        <div>
          <h3 id="group-change-title">Mudanças de lote sugeridas</h3>
          <p>A medição continua válida mesmo se você rejeitar a mudança. O histórico só muda com sua confirmação.</p>
        </div>
        {groupChangeProposals.map((proposal) => <article className="review-group-change" key={proposal.animalId}>
          <div>
            <strong>{proposal.animalName || 'Animal vinculado'}</strong>
            <p>{proposal.fromGroupName || 'Sem lote'} → {proposal.toGroupName} em {formatDate(proposal.changedOn)}</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Decisão de mudança de lote de ${proposal.animalName || 'animal'}`}>
            <Button type="button" variant={groupChangeDecisions[proposal.animalId] === true ? 'primary' : 'secondary'} onClick={() => {
              setGroupChangeDecisions((current) => ({ ...current, [proposal.animalId]: true }));
              setDirty(true);
            }}>Confirmar mudança</Button>
            <Button type="button" variant={groupChangeDecisions[proposal.animalId] === false ? 'primary' : 'secondary'} onClick={() => {
              setGroupChangeDecisions((current) => ({ ...current, [proposal.animalId]: false }));
              setDirty(true);
            }}>Manter lote atual</Button>
          </div>
        </article>)}
      </section>}
      <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
        <p className={`text-xs ${invalidMeasurementCount || unresolvedMergeCount ? 'font-semibold text-[var(--danger)]' : 'text-[var(--muted)]'}`}>
          {invalidMeasurementCount
            ? `${invalidMeasurementCount} linha(s) precisa(m) de um valor ou deve(m) ser excluída(s).`
            : unresolvedMergeCount
              ? `${unresolvedMergeCount} animal(is) já medido(s) precisa(m) de uma decisão.`
              : unresolvedGroupChangeCount
                ? `${unresolvedGroupChangeCount} mudança(s) de lote precisa(m) de uma decisão.`
              : 'Confirme em um toque as linhas revisadas. Linhas aguardando revisão ficam fora dos totais.'}
        </p>
        <SubmitBar
          label={preview.existingSession ? 'Adicionar ao controle existente' : 'Salvar controle revisado'}
          busy={busy}
          disabled={preview.sessionIssues.length > 0 || invalidMeasurementCount > 0 || unresolvedMergeCount > 0 || unresolvedGroupChangeCount > 0 || metadataInvalid}
        />
      </form>
    </SectionCard>
  </div>;
}
