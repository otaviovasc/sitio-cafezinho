import { FormEvent, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Button, ErrorState, Field, FormErrorSummary, Input } from '../../components/ui';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';
import { useToast } from '../../components/feedback-context';

export function AnimalGroupChangeForm({ animalId, currentGroupId, onSaved, onCancel }: { animalId: string; currentGroupId?: string | null; onSaved: () => void | Promise<void>; onCancel?: () => void }) {
  const toast = useToast();
  const [groupId, setGroupId] = useState(currentGroupId ?? '');
  const [startedOn, setStartedOn] = useState(today());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [groupError, setGroupError] = useState('');
  const [dateError, setDateError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!groupId) { setGroupError('Selecione o novo lote de ordenha.'); return; }
    if (groupId === currentGroupId) { setGroupError('Selecione um lote diferente do atual.'); return; }
    if (!startedOn) { setDateError('Informe a data da mudança.'); return; }
    setBusy(true);
    try { await api(`/api/animals/${animalId}/group-assignments`, json('POST', { groupId, startedOn, notes: notes.trim() || null })); toast('Lote do animal atualizado'); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível mudar o lote.'); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-3" noValidate onSubmit={submit}>{error && <ErrorState message={error} />}<FormErrorSummary errors={[groupError, dateError]} /><GroupPicker label="Novo lote de ordenha" value={groupId} fieldError={groupError} onChange={(value) => { setGroupId(value); setGroupError(''); }} /><div className="grid gap-3 sm:grid-cols-2"><Field label="Data da mudança" error={dateError}><Input type="date" value={startedOn} max={today()} onChange={(event) => { setStartedOn(event.target.value); setDateError(''); }} required /></Field><Field label="Motivo (opcional)"><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: ajuste da rotina" /></Field></div><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}><ArrowRightLeft size={18} aria-hidden />{busy ? 'Movendo…' : 'Registrar mudança'}</Button>{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}</div></form>;
}
