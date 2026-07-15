import { FormEvent, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { allowedNextStatuses, statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { Button, ErrorState, Field, Input, Select, Textarea } from '../../components/ui';
import { api, json } from '../../lib/api';
import { animalStatusLabels, today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';

type Props = {
  animalId: string;
  currentStatus: AnimalStatus;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
};

export function AnimalStatusChangeForm({ animalId, currentStatus, onSaved, onCancel }: Props) {
  const choices = allowedNextStatuses(currentStatus);
  const suggested = choices[0] ?? currentStatus;
  const [status, setStatus] = useState<AnimalStatus>(suggested);
  const [changedOn, setChangedOn] = useState(today());
  const [notes, setNotes] = useState('');
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/api/animals/${animalId}/status-changes`, json('POST', { status, changedOn, notes: notes.trim() || null, groupId: statusRequiresMilkingGroup(status) ? groupId : null }));
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a situação.'); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-3" onSubmit={submit}>
    {error && <ErrorState message={error} />}
    <div className="notice notice-info flex gap-2"><RefreshCw className="mt-0.5 shrink-0" size={17} aria-hidden /><span>A mudança fica registrada no histórico. Ao sair de lactação, o lote de ordenha é encerrado.</span></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nova situação"><Select value={status} onChange={(event) => setStatus(event.target.value as AnimalStatus)}>{choices.map((value) => <option key={value} value={value}>{animalStatusLabels[value]}</option>)}</Select></Field>
      <Field label="Data da mudança"><Input type="date" value={changedOn} max={today()} onChange={(event) => setChangedOn(event.target.value)} required /></Field>
    </div>
    {statusRequiresMilkingGroup(status) && <GroupPicker label="Lote de ordenha" value={groupId} onChange={setGroupId} />}
    {(status === 'SOLD' || status === 'DEAD') && <div className="notice notice-warning flex gap-2"><AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden /><span>Esta situação retira a vaca dos controles futuros. Confirme data e motivo com atenção.</span></div>}
    <Field label="Motivo ou observação" hint={status === 'SOLD' || status === 'DEAD' ? 'Obrigatório para preservar o histórico.' : undefined}><Textarea className="min-h-16" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={status === 'DRY' ? 'Ex.: início do período seco' : status === 'LACTATING' ? 'Ex.: data do parto e início da lactação' : 'Opcional'} /></Field>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || status === currentStatus || (statusRequiresMilkingGroup(status) && !groupId) || ((status === 'SOLD' || status === 'DEAD') && !notes.trim())}>{busy ? 'Registrando…' : status === 'LACTATING' ? 'Registrar parto e iniciar lactação' : 'Registrar mudança'}</Button>{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}</div>
  </form>;
}
