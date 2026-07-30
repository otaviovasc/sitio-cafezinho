import { useMemo, useState } from 'react';
import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { animalStatuses, isLiveStatus, statusAllowedForSex, statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { canRegisterAnimalFromMeasurement, identityFromRawAnimalLabel, shouldSelectRegistrationByDefault, type RegistrationCandidate } from '../../../domain/animal-registration';
import { Button, ErrorState, Field, FormErrorSummary, ScrollArea, Select } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { api, json } from '../../lib/api';
import { animalStatusLabels } from '../../lib/labels';
import { confidenceLabel } from '../../lib/status';
import { GroupPicker, type HerdGroup } from './GroupPicker';
import { milkingGroupRoutines, nonMilkingGroupRoutines } from './group-routines';

export type LabelCandidate = RegistrationCandidate & { index: number };
export type BulkCreatedAnimal = { index: number; animal: { id: string; name: string | null; tagNumber: string | null; status: string } };

/**
 * Cadastro em massa das linhas legíveis sem vínculo de uma revisão assistida
 * (controle individual importado ou pesagem por IA): confiança OK começa
 * marcada, baixa confiança começa desmarcada e linha excluída/ilegível nunca é
 * candidata (canRegisterAnimalFromMeasurement). UM lote/situação para todas,
 * confirmação humana e o rótulo exato vira nome ou brinco
 * (identityFromRawAnimalLabel). Grava pelo POST /api/animals/bulk e devolve o
 * mapa linha → animal para a revisão re-casar as linhas sem retrabalho.
 */
export function BulkRegisterFromLabels({ date, rows, fixedStatus, defaultGroupId = '', testIdPrefix, onCreated, onCancel }: {
  date: string;
  rows: LabelCandidate[];
  /** Situação fixa (ex.: LACTATING no controle de leite); sem ela, o usuário escolhe. */
  fixedStatus?: AnimalStatus;
  defaultGroupId?: string;
  testIdPrefix: string;
  onCreated: (created: BulkCreatedAnimal[], group: HerdGroup | null) => void | Promise<void>;
  onCancel: () => void;
}) {
  const candidates = useMemo(() => rows.filter(canRegisterAnimalFromMeasurement), [rows]);
  const [selected, setSelected] = useState(() => new Set(candidates.filter(shouldSelectRegistrationByDefault).map((row) => row.index)));
  const [status, setStatus] = useState<AnimalStatus>(fixedStatus ?? 'LACTATING');
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ selection?: string; group?: string }>({});
  const { data: groups } = useResource<HerdGroup[]>('/api/herd-groups');
  const needsMilkingGroup = statusRequiresMilkingGroup(status);
  const statusOptions = animalStatuses.filter((candidate) => isLiveStatus(candidate) && statusAllowedForSex(candidate, 'FEMALE'));
  const selectedLabel = `${selected.size} ${selected.size === 1 ? 'animal' : 'animais'}`;

  function toggle(index: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(index); else next.delete(index);
      return next;
    });
    setFieldErrors((current) => ({ ...current, selection: undefined }));
  }

  function changeStatus(next: AnimalStatus) {
    setStatus(next);
    setGroupId('');
  }

  async function submit() {
    const nextErrors = {
      selection: selected.size ? undefined : 'Selecione ao menos uma linha.',
      group: needsMilkingGroup && !groupId ? 'Escolha o lote de ordenha destes animais.' : undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.selection || nextErrors.group) return;
    setBusy(true); setError('');
    try {
      const chosen = candidates.filter((row) => selected.has(row.index));
      const result = await api<{ created: number; animals: BulkCreatedAnimal['animal'][] }>('/api/animals/bulk', json('POST', {
        status,
        groupId: groupId || null,
        changedOn: date,
        animals: chosen.map((row) => ({ ...identityFromRawAnimalLabel(row.rawAnimalLabel), sex: 'FEMALE', notes: 'Cadastrado durante a revisão assistida.' })),
      }));
      const group = groups?.find((item) => item.id === groupId) ?? null;
      await onCreated(chosen.map((row, position) => ({ index: row.index, animal: result.animals[position] })), group);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar os animais.'); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4" data-testid={`${testIdPrefix}-panel`}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={Object.values(fieldErrors)} />
    <div>
      <h3 className="font-bold">Cadastrar animais sem vínculo</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">Os selecionados serão cadastrados como <strong>{animalStatusLabels[status].toLocaleLowerCase('pt-BR')}</strong> em {date.split('-').reverse().join('/')} e vinculados às linhas. O rótulo original vira nome ou brinco, sem correção automática.</p>
    </div>
    {!fixedStatus && <Field label="Situação na data"><Select value={status} onChange={(event) => changeStatus(event.target.value as AnimalStatus)}>{statusOptions.map((value) => <option key={value} value={value}>{animalStatusLabels[value]}</option>)}</Select></Field>}
    <GroupPicker
      label={needsMilkingGroup ? 'Lote de ordenha para todos' : 'Lote (sem ordenha) para todos'}
      routines={needsMilkingGroup ? milkingGroupRoutines : nonMilkingGroupRoutines}
      required={needsMilkingGroup}
      value={groupId}
      fieldError={fieldErrors.group}
      onChange={(value) => { setGroupId(value); setFieldErrors((current) => ({ ...current, group: undefined })); }}
    />
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Linhas para cadastrar ({selected.size}/{candidates.length})</strong><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setSelected(new Set(candidates.map((row) => row.index)))}>Selecionar todas</Button><Button type="button" variant="secondary" onClick={() => setSelected(new Set())}>Limpar</Button></div></div>
      {fieldErrors.selection && <p className="field-error mb-2">{fieldErrors.selection}</p>}
      <ScrollArea label="Animais sem vínculo para cadastro" className="max-h-72 rounded-xl border border-[var(--border)] px-3">
        {candidates.map((row) => <label className="mobile-item cursor-pointer" key={row.index} data-testid={`${testIdPrefix}-line-${row.index}`}><span className="flex min-w-0 items-center gap-3"><input className="h-5 w-5 shrink-0" type="checkbox" checked={selected.has(row.index)} onChange={(event) => toggle(row.index, event.target.checked)} /><span className="min-w-0"><strong className="block truncate">{row.rawAnimalLabel}</strong><span className="text-xs text-[var(--muted)]">{confidenceLabel[row.confidence] ?? confidenceLabel.HIGH}</span></span></span></label>)}
      </ScrollArea>
    </div>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button><Button type="button" data-testid={`${testIdPrefix}-confirm`} disabled={busy || selected.size === 0} onClick={() => void submit()}>{busy ? 'Cadastrando e vinculando…' : `Cadastrar e vincular ${selectedLabel}`}</Button></div>
  </div>;
}
