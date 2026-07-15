import { FormEvent, useMemo, useState } from 'react';
import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { Button, ErrorState, Field, Input, ScrollArea, Select, Textarea } from '../../components/ui';
import { api, json } from '../../lib/api';
import { animalStatusLabels, today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';

type DraftAnimal = { name: string | null; tagNumber: string | null; notes: null };

function parseLines(input: string): DraftAnimal[] {
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [first = '', second = ''] = line.split(';').map((part) => part.trim());
    if (second) return { name: first || null, tagNumber: second || null, notes: null };
    return /^\d+$/.test(first) ? { name: null, tagNumber: first, notes: null } : { name: first, tagNumber: null, notes: null };
  });
}

export function BulkAnimalForm({ onSaved }: { onSaved: (firstId?: string) => void }) {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<AnimalStatus>('LACTATING');
  const [groupId, setGroupId] = useState('');
  const [changedOn, setChangedOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = useMemo(() => parseLines(content), [content]);
  const duplicateTags = rows.map((row) => row.tagNumber).filter((value): value is string => Boolean(value)).filter((tag, index, tags) => tags.indexOf(tag) !== index);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ created: number; animals: Array<{ id: string }> }>('/api/animals/bulk', json('POST', { status, groupId: statusRequiresMilkingGroup(status) ? groupId : null, changedOn, animals: rows }));
      onSaved(result.animals[0]?.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar a lista.'); }
    finally { setBusy(false); }
  }
  return <form className="page-narrow grid gap-4" onSubmit={submit}>
    {error && <ErrorState message={error} />}
    <div className="notice notice-info">Cole um animal por linha. Use <strong>Nome; brinco</strong> quando tiver os dois. Uma linha somente numérica será tratada como brinco.</div>
    <Field label="Lista de animais" hint="Ex.: Caruja; 141"><Textarea className="min-h-52 font-mono text-sm" value={content} onChange={(event) => setContent(event.target.value)} placeholder={'Caruja; 141\nLandrina\n296'} /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Situação inicial"><Select value={status} onChange={(event) => setStatus(event.target.value as AnimalStatus)}>{Object.entries(animalStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Data inicial"><Input type="date" value={changedOn} max={today()} onChange={(event) => setChangedOn(event.target.value)} /></Field></div>
    {statusRequiresMilkingGroup(status) && <GroupPicker label="Lote de ordenha para a lista" value={groupId} onChange={setGroupId} />}
    {duplicateTags.length > 0 && <div className="notice notice-error">Brincos repetidos na lista: {Array.from(new Set(duplicateTags)).join(', ')}.</div>}
    {rows.length > 0 && <div><h3 className="mb-2 text-sm font-bold">Prévia · {rows.length} animal(is)</h3><ScrollArea label="Prévia do cadastro em massa" className="max-h-60">{rows.map((row, index) => <div className="mobile-item" key={`${row.name}-${row.tagNumber}-${index}`}><span><strong>{row.name || `Brinco ${row.tagNumber}`}</strong>{row.name && row.tagNumber && <span className="block text-xs text-[var(--muted)]">Brinco {row.tagNumber}</span>}</span></div>)}</ScrollArea></div>}
    <Button type="submit" disabled={busy || !rows.length || duplicateTags.length > 0 || (statusRequiresMilkingGroup(status) && !groupId)}>{busy ? 'Cadastrando…' : `Cadastrar ${rows.length || ''} animal(is)`}</Button>
  </form>;
}
