import { FormEvent, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { Button, ErrorState, Field, Input, Select, Textarea } from '../../components/ui';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';

export type ReproductiveEvent = {
  id: string;
  type: 'HEAT' | 'CALVING';
  statusEventId: string | null;
  occurredOn: string;
  hadBreeding: boolean;
  bullName: string | null;
  outcome: 'PENDING' | 'NOT_PREGNANT' | 'PREGNANT' | null;
  outcomeRecordedOn: string | null;
  notes: string | null;
};

export function ReproductiveEventForm({ animalId, initial, onSaved, onCancel }: {
  animalId: string;
  initial?: ReproductiveEvent;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? today());
  const [hadBreeding, setHadBreeding] = useState(initial?.hadBreeding ?? false);
  const [bullName, setBullName] = useState(initial?.bullName ?? '');
  const [outcome, setOutcome] = useState(initial?.outcome ?? 'PENDING');
  const [outcomeRecordedOn, setOutcomeRecordedOn] = useState(initial?.outcomeRecordedOn ?? today());
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = {
        occurredOn,
        hadBreeding,
        bullName: hadBreeding ? bullName.trim() || null : null,
        outcome: hadBreeding ? outcome : null,
        outcomeRecordedOn: hadBreeding && outcome !== 'PENDING' ? outcomeRecordedOn : null,
        notes: notes.trim() || null,
      };
      await api(initial ? `/api/animals/${animalId}/reproductive-events/${initial.id}` : `/api/animals/${animalId}/reproductive-events`, json(initial ? 'PATCH' : 'POST', body));
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cio.'); }
    finally { setBusy(false); }
  }

  return <form className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4" onSubmit={submit}>
    {error && <ErrorState message={error} />}
    <div className="flex items-start gap-2 text-sm"><HeartPulse className="mt-0.5 shrink-0 text-[var(--primary)]" size={18} aria-hidden /><p><strong>Cio observado</strong><span className="block text-[var(--muted)]">Informe se houve cobertura. Uma observação de cio não confirma prenhez.</span></p></div>
    <Field label="Data do cio"><Input type="date" max={today()} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} required /></Field>
    <Field label="Houve cobertura pelo touro?">
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={!hadBreeding ? 'primary' : 'secondary'} onClick={() => setHadBreeding(false)}>Não</Button><Button type="button" variant={hadBreeding ? 'primary' : 'secondary'} onClick={() => setHadBreeding(true)}>Sim</Button></div>
    </Field>
    {hadBreeding && <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Touro (opcional)"><Input value={bullName} onChange={(event) => setBullName(event.target.value)} placeholder="Nome ou identificação" /></Field>
      <Field label="Resultado"><Select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="PENDING">Aguardando confirmação</option><option value="NOT_PREGNANT">Não emprenhou</option><option value="PREGNANT">Prenhez confirmada</option></Select></Field>
      {outcome !== 'PENDING' && <Field label="Data da confirmação"><Input type="date" min={occurredOn} max={today()} value={outcomeRecordedOn} onChange={(event) => setOutcomeRecordedOn(event.target.value)} required /></Field>}
    </div>}
    <Field label="Observação (opcional)"><Textarea className="min-h-16" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Sinais observados ou informação útil" /></Field>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : initial ? 'Salvar correção' : 'Salvar cio'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
