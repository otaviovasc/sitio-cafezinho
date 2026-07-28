import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { formatWeight } from '../../../../domain/weight';
import { ParsedDecimalInput } from '../../../components/form-controls';
import { ErrorState, Field, Select, SkeletonList } from '../../../components/ui';
import { useResource } from '../../../hooks/useResource';
import { api, json } from '../../../lib/api';
import { today } from '../../../lib/labels';
import { commitReviewAction, type ReviewableAction } from '../review';

type Animal = { id: string; name: string | null; tagNumber: string | null };

type ReviewRow = {
  rawAnimalLabel: string;
  rawValueText: string | null;
  weightKg: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'CONFIRMED' | 'NEEDS_REVIEW' | 'EXCLUDED';
  notes: string | null;
  animalId: string | null;
  matchedAnimal: { id: string; name: string | null; tagNumber: string | null } | null;
  previousWeight: { weightKg: string; measuredAt: string } | null;
  issues: string[];
};

type ValidateResult = { measuredOn: string; measurements: ReviewRow[] };

function animalLabel(animal: Animal | ReviewRow['matchedAnimal']) {
  return animal?.name || (animal?.tagNumber ? `Brinco ${animal.tagNumber}` : 'Animal sem identificação');
}

/**
 * Revisão da pesagem falada/fotografada dentro da folha da balança: as linhas
 * animal+kg da interpretação são REVALIDADAS pelo POST
 * /api/weight-sessions/validate (casamento exato, peso anterior, variação e
 * demais inconsistências — o mesmo validador da importação de pesagem), o
 * usuário corrige linha a linha e o Confirmar grava pelo commit da ação
 * proposta (pipeline de revisão). Linhas sem vínculo/excluídas ficam
 * preservadas e nunca criam animal.
 */
export function WeighingReviewFlow({ action, onCommitted }: {
  action: ReviewableAction;
  onCommitted: () => void;
}) {
  const payload = action.resolvedPayload ?? {};
  const measuredOn = typeof payload.measuredOn === 'string' ? payload.measuredOn : today();
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: animals } = useResource<Animal[]>('/api/animals');

  useEffect(() => {
    const draftRows = Array.isArray(payload.measurements) ? payload.measurements as Array<Record<string, unknown>> : [];
    const content = JSON.stringify({
      measuredOn,
      measurements: draftRows.map((row) => ({
        rawAnimalLabel: String(row.rawAnimalLabel ?? ''),
        rawValueText: (row.rawValueText as string | null | undefined) ?? null,
        weightKg: typeof row.weightKg === 'number' ? row.weightKg : null,
        confidence: row.confidence ?? 'LOW',
        excluded: row.excluded === true,
        notes: (row.notes as string | null | undefined) ?? null,
      })),
    });
    let cancelled = false;
    api<ValidateResult>('/api/weight-sessions/validate', json('POST', { content }))
      .then((result) => { if (!cancelled) setRows(result.measurements); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível validar a pesagem.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(index: number, values: Partial<ReviewRow>) {
    setRows((current) => current?.map((row, position) => position === index ? { ...row, ...values } : row) ?? current);
  }

  function selectAnimal(index: number, animalId: string | null) {
    const row = rows?.[index];
    if (!row) return;
    const selected = animals?.find((animal) => animal.id === animalId) ?? null;
    update(index, {
      animalId,
      matchedAnimal: selected,
      status: row.status === 'EXCLUDED' ? 'EXCLUDED' : animalId && row.weightKg !== null ? 'CONFIRMED' : 'NEEDS_REVIEW',
      issues: row.issues.filter((issue) => issue !== 'Animal não encontrado por nome, brinco ou alias exato.'),
    });
  }

  function setWeight(index: number, weightKg: number | null) {
    const row = rows?.[index];
    if (!row) return;
    update(index, {
      weightKg,
      status: row.status === 'EXCLUDED' ? 'EXCLUDED' : row.animalId && weightKg !== null ? 'CONFIRMED' : 'NEEDS_REVIEW',
      issues: weightKg !== null ? row.issues.filter((issue) => issue !== 'Peso ilegível ou ausente.') : row.issues,
    });
  }

  async function confirm() {
    if (!rows) return;
    setBusy(true);
    setError('');
    try {
      await commitReviewAction(action, {
        measuredOn,
        title: 'Pesagem do rebanho',
        measurements: rows.map(({ matchedAnimal: _matchedAnimal, previousWeight: _previousWeight, issues: _issues, ...row }) => row),
      });
      onCommitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a pesagem.');
      setBusy(false);
    }
  }

  if (error && !rows) return <ErrorState message={error} />;
  if (!rows) return <SkeletonList rows={3} />;

  const activeRows = rows.filter((row) => row.status !== 'EXCLUDED');
  const confirmedCount = rows.filter((row) => row.status === 'CONFIRMED').length;
  const pendingCount = activeRows.length - confirmedCount;

  return <div className="grid gap-3" data-testid="game-weighing-review">
    {error && <ErrorState message={error} />}
    <p className="game-notebook-heading">Pesagem de {measuredOn.split('-').reverse().join('/')} · {confirmedCount} confirmada(s){pendingCount > 0 ? ` · ${pendingCount} a revisar` : ''}</p>
    {rows.map((row, index) => <div key={`${row.rawAnimalLabel}-${index}`} className="game-individual-card" data-testid={`game-weighing-review-row-${index}`}>
      <div className="flex items-center justify-between gap-2">
        <strong className="game-individual-name">{row.rawAnimalLabel}</strong>
        {row.status === 'EXCLUDED'
          ? <button type="button" className="game-sheet-back" onClick={() => update(index, { status: 'NEEDS_REVIEW' })}>Restaurar</button>
          : <button type="button" className="game-sheet-back" onClick={() => update(index, { status: 'EXCLUDED' })}>Excluir linha</button>}
      </div>
      {row.rawValueText && <p className="text-xs text-[var(--muted)]">Original: “{row.rawValueText}”</p>}
      {row.status !== 'EXCLUDED' && <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Animal vinculado" hint={row.previousWeight ? `Último peso: ${formatWeight(row.previousWeight.weightKg)}` : undefined}>
          <Select value={row.animalId ?? ''} onChange={(event) => selectAnimal(index, event.target.value || null)}>
            <option value="">Sem vínculo</option>
            {animals?.map((animal) => <option key={animal.id} value={animal.id}>{animalLabel(animal)}</option>)}
          </Select>
        </Field>
        <Field label="Peso (kg)">
          <ParsedDecimalInput className="game-individual-input" suffix="kg" value={row.weightKg} onValueChange={(value) => setWeight(index, value)} />
        </Field>
      </div>}
      {row.status !== 'EXCLUDED' && row.issues.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-[var(--warning)]">{row.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    </div>)}
    <button type="button" className="game-cta" data-testid="game-weighing-review-save" disabled={busy || !rows.length} onClick={() => void confirm()}>
      <Check size={18} aria-hidden />{busy ? 'Salvando…' : 'Confirmar pesagem'}
    </button>
  </div>;
}
