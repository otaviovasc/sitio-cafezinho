import { MapPin } from 'lucide-react';
import { formatDate } from '../../../domain/format';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select } from '../../components/ui';
import { ReviewCard } from '../../components/review';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { useToast } from '../../components/feedback-context';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import type { HerdGroup } from '../animals/GroupPicker';
import type { PastureSummary } from './types';

/**
 * Movimentação real de um lote entre pastos (POST /api/herd-groups/:id/pasture):
 * escolha de um pasto livre ou retirada (pastureId null), com a data do fato.
 * O ReviewCard resume a decisão antes de confirmar.
 */
export function MovePastureForm({ group, pastures, onSaved, onCancel }: {
  group: HerdGroup;
  pastures: PastureSummary[];
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const current = pastures.find((pasture) => pasture.currentOccupancy?.herdGroupId === group.id) ?? null;
  const available = pastures.filter((pasture) => pasture.active && !pasture.currentOccupancy);
  const form = useForm(
    { pastureId: '', movedOn: today(), notes: '' },
    { movedOn: (value) => (value ? undefined : 'Informe a data da movimentação.') },
  );
  const destination = available.find((pasture) => pasture.id === form.values.pastureId) ?? null;
  const removing = !form.values.pastureId;

  async function persist() {
    await api(`/api/herd-groups/${group.id}/pasture`, json('POST', {
      pastureId: form.values.pastureId || null,
      movedOn: form.values.movedOn,
      notes: form.values.notes.trim() || null,
    }));
    toast(destination ? `${group.name} movido para ${destination.name}` : `${group.name} retirado do pasto`);
    await onSaved();
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <p className="text-sm text-[var(--muted)]">
      {current ? <>Pasto atual: <strong className="text-[var(--text)]">{current.name}</strong> (desde {formatDate(current.currentOccupancy!.startedOn)}).</> : `${group.name} está fora de pasto no momento.`}
    </p>
    <Field label="Novo pasto" hint="Somente pastos livres aparecem na lista.">
      <Select value={form.values.pastureId} onChange={(event) => form.set('pastureId', event.target.value)}>
        <option value="">Sem pasto (retirar)</option>
        {available.map((pasture) => <option key={pasture.id} value={pasture.id}>{pasture.name}</option>)}
      </Select>
    </Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Data da movimentação" error={form.error('movedOn')}><Input type="date" value={form.values.movedOn} max={today()} onChange={(event) => form.set('movedOn', event.target.value)} onBlur={() => form.blur('movedOn')} required /></Field>
      <Field label="Observação (opcional)"><Input value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} placeholder="Ex.: início do descanso do piquete" /></Field>
    </div>
    <ReviewCard
      accent="action"
      title={<span className="flex items-center gap-2"><MapPin size={17} aria-hidden className="text-[var(--primary)]" />{removing ? `Retirar ${group.name} do pasto` : `${group.name} → ${destination?.name ?? ''}`}</span>}
      subtitle={`Em ${form.values.movedOn ? formatDate(form.values.movedOn) : '—'}${current ? ` · sai de ${current.name}` : ''}`}
      actions={<>
        <Button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Confirmar movimentação'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
      </>}
    />
  </form>;
}
