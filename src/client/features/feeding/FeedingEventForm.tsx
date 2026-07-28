import { useState } from 'react';
import { feedLinesError, type FeedingContext } from '../../../domain/feeding';
import { GUARDRAILS, rangeError } from '../../../domain/guardrails';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select, SubmitBar, Textarea } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { api, ApiError, json } from '../../lib/api';
import { today } from '../../lib/labels';
import type { HerdGroup } from '../animals/GroupPicker';
import type { ReviewSubmit } from '../game/review';
import { FeedLinesEditor } from './FeedLinesEditor';
import { emptyFeedLine, parsedLineQuantity, type FeedLineDraft } from './lines';
import type { FeedInventoryRow } from './types';

export type FeedingEventSaved = { id: string; date: string; context: FeedingContext };

/** Pré-preenchimento do modo revisão (payload da ação proposta de trato). */
export type FeedingEventReviewInitial = {
  date: string;
  herdGroupId: string;
  notes: string;
  lines: FeedLineDraft[];
};

/**
 * Registro de trato (feeding_event + linhas). O contexto vem de quem chama
 * (MILKING pela mangueira, STATION pela estação, PASTURE avulso). Consumo além
 * do saldo derivado NÃO bloqueia: o servidor devolve BEYOND_BALANCE e o
 * usuário confirma explicitamente (padrão confirmPossibleDuplicate).
 * Com `review`, o submit confirma pela pipeline de revisão (commit da ação
 * proposta) em vez de gravar direto — a revisão humana já é a confirmação.
 */
export function FeedingEventForm({ context, initial, review, onSaved }: {
  context: FeedingContext;
  initial?: FeedingEventReviewInitial;
  review?: ReviewSubmit;
  onSaved: (event: FeedingEventSaved) => void;
}) {
  const { busy, error, run, setError } = useSubmit();
  const { data: inventory } = useResource<FeedInventoryRow[]>('/api/feed-inventory');
  const { data: groups } = useResource<HerdGroup[]>('/api/herd-groups');
  const [date, setDate] = useState(initial?.date ?? today());
  const [herdGroupId, setHerdGroupId] = useState(initial?.herdGroupId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<FeedLineDraft[]>(initial?.lines.length ? initial.lines : [emptyFeedLine()]);
  const [formError, setFormError] = useState('');
  const [beyondBalance, setBeyondBalance] = useState(false);

  const milkingGroups = groups?.filter((group) => group.active && group.milkingRoutine !== 'NOT_MILKED') ?? [];

  function validate(): { feedItemId: string; quantity: number }[] | null {
    const parsed = lines.map((line) => ({ feedItemId: line.feedItemId, quantity: parsedLineQuantity(line) }));
    const linesIssue = feedLinesError(parsed);
    if (linesIssue) { setFormError(linesIssue); return null; }
    for (const line of parsed) {
      const issue = rangeError(line.quantity!, GUARDRAILS.feedQuantity);
      if (issue) { setFormError(issue); return null; }
    }
    if (!date) { setFormError('Informe a data do trato.'); return null; }
    if (context === 'MILKING' && !herdGroupId) { setFormError('Selecione o lote que recebeu o trato.'); return null; }
    setFormError('');
    return parsed.map((line) => ({ feedItemId: line.feedItemId, quantity: line.quantity! }));
  }

  async function persist(confirm: boolean) {
    const items = validate();
    if (!items) return;
    setBeyondBalance(false);
    try {
      const body = {
        date,
        context,
        herdGroupId: herdGroupId || null,
        notes: notes.trim() || null,
        items,
        confirmBeyondBalance: confirm,
      };
      if (review) {
        await review.onCommit(body);
        return;
      }
      const saved = await api<FeedingEventSaved>('/api/feeding-events', json('POST', body));
      onSaved(saved);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'BEYOND_BALANCE') setBeyondBalance(true);
      throw cause;
    }
  }

  return <form className="grid gap-4" noValidate data-testid="feeding-event-form" onSubmit={(event) => { event.preventDefault(); if (validate()) void run(() => persist(false)); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={formError ? [formError] : []} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Data do trato">
        <Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} required />
      </Field>
      {context === 'MILKING' && <Field label="Lote da ordenha">
        <Select value={herdGroupId} onChange={(event) => setHerdGroupId(event.target.value)} required>
          <option value="">Selecione…</option>
          {milkingGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </Select>
      </Field>}
      {context !== 'MILKING' && <Field label="Lote (opcional)">
        <Select value={herdGroupId} onChange={(event) => setHerdGroupId(event.target.value)}>
          <option value="">Rebanho todo / não se aplica</option>
          {groups?.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </Select>
      </Field>}
    </div>
    <FeedLinesEditor lines={lines} inventory={inventory ?? []} onChange={(next) => { setLines(next); setBeyondBalance(false); }} />
    <Field label="Observação (opcional)"><Textarea className="min-h-12" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
    <SubmitBar
      label={review?.label ?? 'Registrar trato'}
      busy={busy}
      secondary={beyondBalance && <Button variant="secondary" type="button" disabled={busy} data-testid="feeding-confirm-beyond" onClick={() => { setError(''); void run(() => persist(true)); }}>O estoque está incompleto — registrar mesmo assim</Button>}
    />
  </form>;
}
