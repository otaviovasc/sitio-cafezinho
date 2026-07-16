import { useEffect, useMemo, useRef, useState } from 'react';
import { canRegisterAnimalFromMeasurement, shouldSelectRegistrationByDefault } from '../../../domain/animal-registration';
import { Button, ErrorState, FormErrorSummary, ScrollArea } from '../../components/ui';
import { useToast } from '../../components/feedback-context';
import { api, json } from '../../lib/api';
import { GroupPicker } from '../animals/GroupPicker';

export type UnmatchedMeasurement = {
  id: string;
  animalId: string | null;
  rawAnimalLabel: string;
  status: string;
  confidence: string;
};

export function BulkRegisterAnimalsPanel({ sessionId, sessionDate, rows, onDone, onCancel }: {
  sessionId: string;
  sessionDate: string;
  rows: UnmatchedMeasurement[];
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const candidates = useMemo(() => rows.filter(canRegisterAnimalFromMeasurement), [rows]);
  const [selectedIds, setSelectedIds] = useState(() => new Set(candidates.filter(shouldSelectRegistrationByDefault).map((row) => row.id)));
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ selection?: string; group?: string }>({});
  const selectedLabel = `${selectedIds.size} ${selectedIds.size === 1 ? 'animal' : 'animais'}`;

  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'start' });
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
    setFieldErrors((current) => ({ ...current, selection: undefined }));
  }

  async function submit() {
    const nextErrors = {
      selection: selectedIds.size ? undefined : 'Selecione ao menos uma linha.',
      group: groupId ? undefined : 'Escolha o lote inicial destes animais.',
    };
    setFieldErrors(nextErrors);
    if (nextErrors.selection || nextErrors.group) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ created: number; linked: number }>(`/api/milk-sessions/${sessionId}/register-unmatched-animals`, json('POST', { groupId, measurementIds: [...selectedIds] }));
      toast(`${result.created} ${result.created === 1 ? 'animal cadastrado' : 'animais cadastrados'} e ${result.linked} ${result.linked === 1 ? 'linha vinculada' : 'linhas vinculadas'}`);
      await onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar e vincular os animais.'); }
    finally { setBusy(false); }
  }

  return <div ref={panelRef} className="mb-4 grid scroll-mt-4 gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 outline-none" tabIndex={-1}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={Object.values(fieldErrors)} />
    <div><h3 className="font-bold">Cadastrar animais sem vínculo</h3><p className="mt-1 text-sm text-[var(--muted)]">Os selecionados serão cadastrados como <strong>em lactação</strong> em {sessionDate.split('-').reverse().join('/')} e ligados às medições. O rótulo original será usado sem correção automática.</p></div>
    <GroupPicker label="Lote inicial dos animais selecionados" value={groupId} fieldError={fieldErrors.group} onChange={(value) => { setGroupId(value); setFieldErrors((current) => ({ ...current, group: undefined })); }} />
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Linhas para cadastrar ({selectedIds.size}/{candidates.length})</strong><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set(candidates.map((row) => row.id)))}>Selecionar todas</Button><Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set())}>Limpar</Button></div></div>
      {fieldErrors.selection && <p className="field-error mb-2">{fieldErrors.selection}</p>}
      <ScrollArea label="Animais sem vínculo para cadastro" className="max-h-72 rounded-xl border border-[var(--border)] px-3">
        {candidates.map((row) => <label className="mobile-item cursor-pointer" key={row.id}><span className="flex min-w-0 items-center gap-3"><input className="h-5 w-5 shrink-0" type="checkbox" checked={selectedIds.has(row.id)} onChange={(event) => toggle(row.id, event.target.checked)} /><span className="min-w-0"><strong className="block truncate">{row.rawAnimalLabel}</strong><span className="text-xs text-[var(--muted)]">{row.confidence === 'LOW' ? 'Baixa confiança · confira antes de selecionar' : row.confidence === 'MEDIUM' ? 'Confiança média' : 'Confiança alta'}</span></span></span></label>)}
      </ScrollArea>
    </div>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button><Button type="button" disabled={busy || selectedIds.size === 0} onClick={() => void submit()}>{busy ? 'Cadastrando e vinculando…' : `Cadastrar e vincular ${selectedLabel}`}</Button></div>
  </div>;
}
