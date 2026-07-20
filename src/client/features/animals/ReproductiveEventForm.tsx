import { useState } from 'react';
import { HeartPulse } from 'lucide-react';
import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { Button, ErrorState, Field, Input, Select, Textarea } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import { useToast } from '../../components/feedback-context';

export type ReproductiveEvent = {
  id: string;
  type: 'HEAT' | 'CALVING';
  statusEventId: string | null;
  occurredOn: string;
  hadBreeding: boolean;
  /** Touro cadastrado do rebanho (vínculo); nunca junto de bullName. */
  bullId: string | null;
  /** Nome livre para registros antigos ou touros não cadastrados. */
  bullName: string | null;
  outcome: 'PENDING' | 'NOT_PREGNANT' | 'PREGNANT' | null;
  outcomeRecordedOn: string | null;
  notes: string | null;
};

type Outcome = 'PENDING' | 'NOT_PREGNANT' | 'PREGNANT';
type BullMode = 'REGISTERED' | 'OTHER';

type HerdAnimal = { id: string; name: string | null; tagNumber: string | null; status: AnimalStatus };

export function ReproductiveEventForm({ animalId, initial, onSaved, onCancel }: {
  animalId: string;
  initial?: ReproductiveEvent;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const { data: herd = [] } = useResource<HerdAnimal[]>('/api/animals');
  const bulls = (herd ?? []).filter((animal) => animal.status === 'BULL');
  // Escolha explícita; sem escolha (registro novo), prefere touro cadastrado quando existir.
  const [bullMode, setBullMode] = useState<BullMode | null>(initial ? (initial.bullId ? 'REGISTERED' : 'OTHER') : null);
  const effectiveBullMode: BullMode = bullMode ?? (bulls.length ? 'REGISTERED' : 'OTHER');
  const form = useForm({
    occurredOn: initial?.occurredOn ?? today(),
    hadBreeding: initial?.hadBreeding ?? false,
    bullId: initial?.bullId ?? '',
    bullName: initial?.bullName ?? '',
    outcome: (initial?.outcome ?? 'PENDING') as Outcome,
    outcomeRecordedOn: initial?.outcomeRecordedOn ?? today(),
    notes: initial?.notes ?? '',
  });
  const { occurredOn, hadBreeding, outcome } = form.values;

  async function persist() {
    const body = {
      occurredOn,
      hadBreeding,
      bullId: hadBreeding && effectiveBullMode === 'REGISTERED' ? form.values.bullId || null : null,
      bullName: hadBreeding && effectiveBullMode === 'OTHER' ? form.values.bullName.trim() || null : null,
      outcome: hadBreeding ? outcome : null,
      outcomeRecordedOn: hadBreeding && outcome !== 'PENDING' ? form.values.outcomeRecordedOn : null,
      notes: form.values.notes.trim() || null,
    };
    await api(initial ? `/api/animals/${animalId}/reproductive-events/${initial.id}` : `/api/animals/${animalId}/reproductive-events`, json(initial ? 'PATCH' : 'POST', body));
    toast(initial ? 'Registro de cio atualizado' : 'Cio registrado');
    await onSaved();
  }

  return <form className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4" onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <div className="flex items-start gap-2 text-sm"><HeartPulse className="mt-0.5 shrink-0 text-[var(--primary)]" size={18} aria-hidden /><p><strong>Cio observado</strong><span className="block text-[var(--muted)]">Informe se houve cobertura. Uma observação de cio não confirma prenhez.</span></p></div>
    <Field label="Data do cio"><Input type="date" max={today()} value={occurredOn} onChange={(event) => form.set('occurredOn', event.target.value)} required /></Field>
    <Field label="Houve cobertura pelo touro?">
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={!hadBreeding ? 'primary' : 'secondary'} onClick={() => form.set('hadBreeding', false)}>Não</Button><Button type="button" variant={hadBreeding ? 'primary' : 'secondary'} onClick={() => form.set('hadBreeding', true)}>Sim</Button></div>
    </Field>
    {hadBreeding && <Field label="Qual touro?">
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={effectiveBullMode === 'REGISTERED' ? 'primary' : 'secondary'} onClick={() => setBullMode('REGISTERED')}>Touro do rebanho</Button><Button type="button" variant={effectiveBullMode === 'OTHER' ? 'primary' : 'secondary'} onClick={() => setBullMode('OTHER')}>Outro touro</Button></div>
    </Field>}
    {hadBreeding && effectiveBullMode === 'REGISTERED' && (bulls.length
      ? <Field label="Touro do rebanho"><Select value={form.values.bullId} onChange={(event) => form.set('bullId', event.target.value)}><option value="">Não identificado</option>{bulls.map((bull) => <option key={bull.id} value={bull.id}>{bull.name || `Brinco ${bull.tagNumber}`}</option>)}</Select></Field>
      : <p className="text-sm text-[var(--muted)]">Nenhum touro cadastrado no rebanho — use “Outro touro” para registrar o nome.</p>)}
    {hadBreeding && <div className="grid gap-3 sm:grid-cols-2">
      {effectiveBullMode === 'OTHER' && <Field label="Touro (opcional)"><Input value={form.values.bullName} onChange={(event) => form.set('bullName', event.target.value)} placeholder="Nome ou identificação" /></Field>}
      <Field label="Resultado"><Select value={outcome} onChange={(event) => form.set('outcome', event.target.value as Outcome)}><option value="PENDING">Aguardando confirmação</option><option value="NOT_PREGNANT">Não emprenhou</option><option value="PREGNANT">Prenhez confirmada</option></Select></Field>
      {outcome !== 'PENDING' && <Field label="Data da confirmação"><Input type="date" min={occurredOn} max={today()} value={form.values.outcomeRecordedOn} onChange={(event) => form.set('outcomeRecordedOn', event.target.value)} required /></Field>}
    </div>}
    <Field label="Observação (opcional)"><Textarea className="min-h-16" value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} placeholder="Sinais observados ou informação útil" /></Field>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : initial ? 'Salvar correção' : 'Salvar cio'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
