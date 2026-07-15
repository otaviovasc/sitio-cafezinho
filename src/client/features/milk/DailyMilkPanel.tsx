import { FormEvent, useState } from 'react';
import { formatDate, formatLiters, parseDecimal } from '../../../domain/format';
import { ConfirmButton, Button, ErrorState, Field, Input, SectionCard, Textarea } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';

type DailyMilkTotal = {
  id: string;
  productionDate: string;
  morningLiters: string | null;
  afternoonLiters: string | null;
  totalLiters: string;
  notes: string | null;
};

export function DailyMilkPanel({ onChange }: { onChange?: () => void } = {}) {
  const { data, loading, error, reload } = useResource<DailyMilkTotal[]>('/api/daily-milk-totals');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productionDate, setProductionDate] = useState(today());
  const [morningLiters, setMorningLiters] = useState('');
  const [afternoonLiters, setAfternoonLiters] = useState('');
  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setEditingId(null); setProductionDate(today()); setMorningLiters(''); setAfternoonLiters(''); setNotes(''); setActionError('');
  }

  function edit(row: DailyMilkTotal) {
    setEditingId(row.id); setProductionDate(row.productionDate); setMorningLiters(row.morningLiters ?? ''); setAfternoonLiters(row.afternoonLiters ?? ''); setNotes(row.notes ?? ''); setActionError('');
    document.getElementById('total-diario')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const morning = parseDecimal(morningLiters);
    const afternoon = parseDecimal(afternoonLiters);
    if (morning === null || morning < 0 || afternoon === null || afternoon < 0) { setActionError('Informe valores válidos para manhã e tarde.'); return; }
    setBusy(true); setActionError('');
    try {
      await api(editingId ? `/api/daily-milk-totals/${editingId}` : '/api/daily-milk-totals', json(editingId ? 'PATCH' : 'POST', { productionDate, morningLiters: morning, afternoonLiters: afternoon, notes: notes.trim() || null }));
      reset(); reload(); onChange?.();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível salvar o total diário.'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setActionError('');
    try { await api(`/api/daily-milk-totals/${id}`, { method: 'DELETE' }); if (editingId === id) reset(); reload(); onChange?.(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir o total diário.'); }
    finally { setBusy(false); }
  }

  return <div id="total-diario" className="scroll-mt-20"><SectionCard title="Produção total do dia">
    <p className="mb-4 text-sm text-[var(--muted)]">Registre quanto saiu de manhã e à tarde. O sistema soma o dia, sem distribuir o valor entre as vacas nem substituir o controle individual.</p>
    {(error || actionError) && <div className="mb-3"><ErrorState message={actionError || error} retry={error ? reload : undefined} /></div>}
    <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[11rem_10rem_10rem_minmax(0,1fr)_auto] lg:items-end" onSubmit={save}>
      <Field label="Data"><Input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} required /></Field>
      <Field label="Manhã (L)"><Input inputMode="decimal" placeholder="Ex.: 360,5" value={morningLiters} onChange={(event) => setMorningLiters(event.target.value)} required /></Field>
      <Field label="Tarde (L)"><Input inputMode="decimal" placeholder="Ex.: 260" value={afternoonLiters} onChange={(event) => setAfternoonLiters(event.target.value)} required /></Field>
      <Field label="Observação (opcional)"><Textarea className="min-h-12" placeholder="Ex.: chuva forte" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !morningLiters || !afternoonLiters}>{busy ? 'Salvando…' : editingId ? 'Salvar alteração' : 'Registrar total'}</Button>{editingId && <Button type="button" variant="secondary" onClick={reset}>Cancelar</Button>}</div>
    </form>
    {(parseDecimal(morningLiters) !== null && parseDecimal(afternoonLiters) !== null) && <p className="mt-3 text-sm text-[var(--muted)]">Total calculado: <strong className="text-[var(--text)]">{formatLiters((parseDecimal(morningLiters) ?? 0) + (parseDecimal(afternoonLiters) ?? 0))}</strong></p>}
    <div className="mt-5"><h3 className="text-sm font-bold">Histórico diário</h3>{loading ? <p className="mt-2 text-sm text-[var(--muted)]">Carregando…</p> : !data?.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nenhum total diário registrado.</p> : <div className="scroll-area mt-2 max-h-80" tabIndex={0} role="region" aria-label="Histórico de totais diários">{data.map((row) => <div className="border-b border-[var(--border)] py-3 last:border-b-0 sm:flex sm:items-center sm:justify-between sm:gap-3" key={row.id}><div><strong>{formatDate(row.productionDate)}</strong>{row.morningLiters !== null && row.afternoonLiters !== null ? <span className="block text-sm text-[var(--muted)]">Manhã {formatLiters(row.morningLiters)} · Tarde {formatLiters(row.afternoonLiters)}</span> : <span className="block text-sm text-[var(--muted)]">Registro histórico sem divisão por período</span>}{row.notes && <span className="block text-sm text-[var(--muted)]">{row.notes}</span>}</div><div className="mt-3 sm:mt-0 sm:text-right"><strong className="block text-lg">{formatLiters(row.totalLiters)}</strong><div className="mt-2 grid grid-cols-2 gap-2 sm:flex"><Button variant="secondary" onClick={() => edit(row)}>Editar</Button><ConfirmButton variant="danger" disabled={busy} question="Excluir este total diário?" onClick={() => void remove(row.id)}>Excluir</ConfirmButton></div></div></div>)}</div>}</div>
  </SectionCard></div>;
}
