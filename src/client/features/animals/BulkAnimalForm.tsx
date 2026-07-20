import { useMemo } from 'react';
import type { AnimalSex, AnimalStatus } from '../../../domain/animal-lifecycle';
import { animalStatuses, isLiveStatus, statusAllowedForSex, statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { ErrorState, Field, FormErrorSummary, Input, ScrollArea, Select, SubmitBar, Textarea } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { animalSexLabels, animalStatusLabels, today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';
import { milkingGroupRoutines, nonMilkingGroupRoutines } from './group-routines';
import { useToast } from '../../components/feedback-context';

type DraftAnimal = { name: string | null; tagNumber: string | null; notes: null };

function parseLines(input: string): DraftAnimal[] {
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [first = '', second = ''] = line.split(';').map((part) => part.trim());
    if (second) return { name: first || null, tagNumber: second || null, notes: null };
    return /^\d+$/.test(first) ? { name: null, tagNumber: first, notes: null } : { name: first, tagNumber: null, notes: null };
  });
}

function findDuplicateTags(rows: DraftAnimal[]): string[] {
  return rows.map((row) => row.tagNumber).filter((value): value is string => Boolean(value)).filter((tag, index, tags) => tags.indexOf(tag) !== index);
}

export function BulkAnimalForm({ onSaved }: { onSaved: (firstId?: string) => void }) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const form = useForm(
    { content: '', sex: 'FEMALE' as AnimalSex, status: 'LACTATING' as AnimalStatus, groupId: '', changedOn: today() },
    {
      content: (value) => {
        const rows = parseLines(value);
        if (!rows.length) return 'Informe ao menos um animal.';
        return findDuplicateTags(rows).length ? 'Corrija os brincos repetidos antes de cadastrar.' : undefined;
      },
      groupId: (value, all) => (statusRequiresMilkingGroup(all.status) && !value ? 'Selecione o lote de ordenha.' : undefined),
      changedOn: (value) => (value ? undefined : 'Informe a data inicial.'),
    },
  );
  useUnsavedGuard(form.dirty);
  const rows = useMemo(() => parseLines(form.values.content), [form.values.content]);
  const duplicateTags = findDuplicateTags(rows);
  const { sex, status } = form.values;
  const statusOptions = animalStatuses.filter((candidate) => isLiveStatus(candidate) && statusAllowedForSex(candidate, sex));

  function changeSex(next: AnimalSex) {
    form.set('sex', next);
    if (!statusAllowedForSex(form.values.status, next)) {
      const fallback = animalStatuses.find((candidate) => isLiveStatus(candidate) && statusAllowedForSex(candidate, next));
      if (fallback) changeStatus(fallback);
    }
  }

  function changeStatus(next: AnimalStatus) {
    form.set('status', next);
    form.set('groupId', '');
  }

  async function persist() {
    const { sex: sexValue, status: statusValue, groupId, changedOn } = form.values;
    const result = await api<{ created: number; animals: Array<{ id: string }> }>('/api/animals/bulk', json('POST', {
      status: statusValue,
      groupId: groupId || null,
      changedOn,
      animals: rows.map((row) => ({ ...row, sex: sexValue })),
    }));
    toast(`${result.created} animal(is) cadastrado(s)`);
    onSaved(result.animals[0]?.id);
  }

  return <form className="page-narrow grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <div className="notice notice-info">Cole um animal por linha. Use <strong>Nome; brinco</strong> quando tiver os dois. Uma linha somente numérica será tratada como brinco. Sexo, situação e lote valem para a lista inteira.</div>
    <Field label="Lista de animais" hint="Ex.: Caruja; 141" error={form.error('content')}><Textarea className="min-h-52 font-mono text-sm" value={form.values.content} required onChange={(event) => form.set('content', event.target.value)} onBlur={() => form.blur('content')} placeholder={'Caruja; 141\nLandrina\n296'} /></Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Sexo da lista"><Select value={sex} onChange={(event) => changeSex(event.target.value as AnimalSex)} required>{Object.entries(animalSexLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
      <Field label="Situação inicial"><Select value={status} onChange={(event) => changeStatus(event.target.value as AnimalStatus)}>{statusOptions.map((value) => <option key={value} value={value}>{animalStatusLabels[value]}</option>)}</Select></Field>
    </div>
    <Field label="Data inicial" error={form.error('changedOn')}><Input type="date" value={form.values.changedOn} max={today()} required onChange={(event) => form.set('changedOn', event.target.value)} onBlur={() => form.blur('changedOn')} /></Field>
    {statusRequiresMilkingGroup(status)
      ? <GroupPicker label="Lote de ordenha para a lista" routines={milkingGroupRoutines} value={form.values.groupId} fieldError={form.error('groupId')} onChange={(value) => form.set('groupId', value)} />
      : <GroupPicker label="Lote (sem ordenha) para a lista" routines={nonMilkingGroupRoutines} required={false} value={form.values.groupId} fieldError={form.error('groupId')} onChange={(value) => form.set('groupId', value)} />}
    {duplicateTags.length > 0 && <div className="notice notice-error">Brincos repetidos na lista: {Array.from(new Set(duplicateTags)).join(', ')}.</div>}
    {rows.length > 0 && <div><h3 className="mb-2 text-sm font-bold">Prévia · {rows.length} animal(is)</h3><ScrollArea label="Prévia do cadastro em massa" className="max-h-60">{rows.map((row, index) => <div className="mobile-item" key={`${row.name}-${row.tagNumber}-${index}`}><span><strong>{row.name || `Brinco ${row.tagNumber}`}</strong>{row.name && row.tagNumber && <span className="block text-xs text-[var(--muted)]">Brinco {row.tagNumber}</span>}</span></div>)}</ScrollArea></div>}
    <SubmitBar label={`Cadastrar ${rows.length || ''} animal(is)`} busyLabel="Cadastrando…" busy={busy} />
  </form>;
}
