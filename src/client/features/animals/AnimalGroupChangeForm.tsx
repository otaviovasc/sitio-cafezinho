import { FormEvent, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Button, ErrorState, Field, Input } from '../../components/ui';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';

export function AnimalGroupChangeForm({ animalId, currentGroupId, onSaved, onCancel }: { animalId: string; currentGroupId?: string | null; onSaved: () => void | Promise<void>; onCancel?: () => void }) {
  const [groupId, setGroupId] = useState(currentGroupId ?? '');
  const [startedOn, setStartedOn] = useState(today());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(`/api/animals/${animalId}/group-assignments`, json('POST', { groupId, startedOn, notes: notes.trim() || null })); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível mudar o lote.'); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-3" onSubmit={submit}>{error && <ErrorState message={error} />}<GroupPicker label="Novo lote de ordenha" value={groupId} onChange={setGroupId} /><div className="grid gap-3 sm:grid-cols-2"><Field label="Data da mudança"><Input type="date" value={startedOn} max={today()} onChange={(event) => setStartedOn(event.target.value)} required /></Field><Field label="Motivo (opcional)"><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: ajuste da rotina" /></Field></div><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !groupId || groupId === currentGroupId}><ArrowRightLeft size={18} aria-hidden />{busy ? 'Movendo…' : 'Registrar mudança'}</Button>{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}</div></form>;
}
