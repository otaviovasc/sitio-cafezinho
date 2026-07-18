import { useState } from 'react';
import { parseDecimal } from '../../../../domain/format';
import { GUARDRAILS, rangeError } from '../../../../domain/guardrails';
import { LitersInput } from '../../../components/form-controls';
import { Button, ErrorState, Field, FormErrorSummary, Input, SubmitBar, Textarea } from '../../../components/ui';
import { useForm } from '../../../hooks/useForm';
import { useSubmit } from '../../../hooks/useSubmit';
import { api, json, ApiError } from '../../../lib/api';
import { today } from '../../../lib/labels';

export type MilkCollectionSaved = { id: string; collectionDate: string; liters: string };

/**
 * Coleta do laticínio direto da mangueira: data + litros retirados. Grava o
 * fato real em /api/milk-collections; a possível duplicata (mesma data e
 * volume) usa o erro real do endpoint, com confirmação explícita.
 */
export function QuickCollectionForm({ onSaved }: { onSaved: (collection: MilkCollectionSaved) => void }) {
  const { busy, error, run, setError } = useSubmit();
  const [possibleDuplicate, setPossibleDuplicate] = useState(false);
  const form = useForm(
    { collectionDate: today(), liters: '', notes: '' },
    {
      collectionDate: (value) => (value ? undefined : 'Informe a data da coleta.'),
      liters: (value) => {
        const parsed = parseDecimal(value);
        if (parsed === null) return 'Informe um volume maior que zero.';
        if (parsed <= 0) return 'Informe um volume maior que zero.';
        return rangeError(parsed, GUARDRAILS.collectionLiters, ' L');
      },
    },
  );

  async function persist(confirmDuplicate: boolean) {
    setPossibleDuplicate(false);
    try {
      const saved = await api<MilkCollectionSaved>('/api/milk-collections', json('POST', {
        collectionDate: form.values.collectionDate,
        liters: parseDecimal(form.values.liters),
        notes: form.values.notes.trim() || null,
        confirmPossibleDuplicate: confirmDuplicate,
      }));
      onSaved(saved);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'POSSIBLE_DUPLICATE') setPossibleDuplicate(true);
      throw cause;
    }
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(() => persist(false)); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Data da coleta" error={form.error('collectionDate')}>
        <Input type="date" value={form.values.collectionDate} max={today()} onChange={(event) => form.set('collectionDate', event.target.value)} onBlur={() => form.blur('collectionDate')} required />
      </Field>
      <Field label="Litros retirados" error={form.error('liters')}>
        <LitersInput placeholder="Ex.: 360,5" value={form.values.liters} onValueChange={(value) => form.set('liters', value)} onBlur={() => form.blur('liters')} autoFocus required />
      </Field>
    </div>
    <Field label="Observação (opcional)"><Textarea className="min-h-12" placeholder="Ex.: leitura do motorista" value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field>
    <SubmitBar
      label="Registrar coleta"
      busy={busy}
      secondary={possibleDuplicate && <Button variant="secondary" type="button" disabled={busy} onClick={() => { setError(''); void run(() => persist(true)); }}>Era outra coleta — registrar mesmo assim</Button>}
    />
  </form>;
}
