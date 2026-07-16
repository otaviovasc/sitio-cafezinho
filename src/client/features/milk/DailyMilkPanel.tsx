import { FormEvent, useState } from 'react';
import { formatDate, formatLiters, parseDecimal } from '../../../domain/format';
import { Badge, ConfirmButton, Button, ErrorState, Field, Input, SectionCard, Select, Textarea } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import type { HerdGroup } from '../animals/GroupPicker';

type DailyMilkTotal = {
  id: string;
  productionDate: string;
  herdGroupId: string | null;
  herdGroupName: string | null;
  milkingRoutine: HerdGroup['milkingRoutine'] | null;
  morningLiters: string | null;
  afternoonLiters: string | null;
  totalLiters: string;
  notes: string | null;
};

export function DailyMilkPanel({ onChange }: { onChange?: () => void } = {}) {
  const { data, loading, error, reload } = useResource<DailyMilkTotal[]>('/api/daily-milk-totals');
  const { data: groups = [], error: groupsError, reload: reloadGroups } = useResource<HerdGroup[]>('/api/herd-groups');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productionDate, setProductionDate] = useState(today());
  const [herdGroupId, setHerdGroupId] = useState('');
  const [morningLiters, setMorningLiters] = useState('');
  const [afternoonLiters, setAfternoonLiters] = useState('');
  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedGroup = groups?.find((group) => group.id === herdGroupId) ?? null;
  const morningOnly = selectedGroup?.milkingRoutine === 'MORNING_ONLY';
  const parsedMorning = parseDecimal(morningLiters);
  const parsedAfternoon = morningOnly ? null : parseDecimal(afternoonLiters);
  const previewTotal = parsedMorning !== null && (morningOnly || parsedAfternoon !== null)
    ? parsedMorning + (parsedAfternoon ?? 0)
    : null;

  function reset() {
    setEditingId(null); setProductionDate(today()); setHerdGroupId(''); setMorningLiters(''); setAfternoonLiters(''); setNotes(''); setActionError('');
  }

  function edit(row: DailyMilkTotal) {
    setEditingId(row.id); setProductionDate(row.productionDate); setHerdGroupId(row.herdGroupId ?? ''); setMorningLiters(row.morningLiters ?? ''); setAfternoonLiters(row.afternoonLiters ?? ''); setNotes(row.notes ?? ''); setActionError('');
    document.getElementById('total-diario')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (parsedMorning === null || parsedMorning < 0 || (!morningOnly && (parsedAfternoon === null || parsedAfternoon < 0))) {
      setActionError(morningOnly ? 'Informe um valor válido para a manhã.' : 'Informe valores válidos para manhã e tarde.');
      return;
    }
    setBusy(true); setActionError('');
    try {
      await api(editingId ? `/api/daily-milk-totals/${editingId}` : '/api/daily-milk-totals', json(editingId ? 'PATCH' : 'POST', {
        productionDate,
        herdGroupId: herdGroupId || null,
        morningLiters: parsedMorning,
        afternoonLiters: morningOnly ? null : parsedAfternoon,
        notes: notes.trim() || null,
      }));
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
    <p className="mb-4 text-sm text-[var(--muted)]">Registre o volume do rebanho todo ou de um lote medido separadamente. O sistema não distribui esse total entre as vacas e mantém o controle individual como outro fato.</p>
    {(error || groupsError || actionError) && <div className="mb-3"><ErrorState message={actionError || error || groupsError || ''} retry={error ? reload : groupsError ? reloadGroups : undefined} /></div>}
    <form className="grid gap-3" onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Data"><Input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} required /></Field>
        <Field label="Produção de" hint={herdGroupId ? 'Use lote apenas quando o volume foi medido separadamente.' : 'Total geral da propriedade.'}>
          <Select value={herdGroupId} onChange={(event) => { setHerdGroupId(event.target.value); const group = groups?.find((item) => item.id === event.target.value); if (group?.milkingRoutine === 'MORNING_ONLY') setAfternoonLiters(''); }}>
            <option value="">Rebanho todo</option>
            {groups?.filter((group) => group.active || group.id === herdGroupId).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </Select>
        </Field>
        <Field label="Manhã (L)"><Input inputMode="decimal" placeholder="Ex.: 210,5" value={morningLiters} onChange={(event) => setMorningLiters(event.target.value)} required /></Field>
        <Field label="Tarde (L)" hint={morningOnly ? 'Este lote possui ordenha somente pela manhã.' : undefined}><Input inputMode="decimal" placeholder={morningOnly ? 'Sem ordenha à tarde' : 'Ex.: 175'} value={morningOnly ? '' : afternoonLiters} onChange={(event) => setAfternoonLiters(event.target.value)} required={!morningOnly} disabled={morningOnly} /></Field>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <Field label="Observação (opcional)"><Textarea className="min-h-12" placeholder="Ex.: medição separada no tanque do lote" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || previewTotal === null}>{busy ? 'Salvando…' : editingId ? 'Salvar alteração' : 'Registrar total'}</Button>{editingId && <Button type="button" variant="secondary" onClick={reset}>Cancelar</Button>}</div>
      </div>
    </form>
    {previewTotal !== null && <p className="mt-3 text-sm text-[var(--muted)]">Total calculado: <strong className="text-[var(--text)]">{formatLiters(previewTotal)}</strong></p>}
    <div className="mt-5"><h3 className="text-sm font-bold">Histórico diário</h3>{loading ? <p className="mt-2 text-sm text-[var(--muted)]">Carregando…</p> : !data?.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nenhuma produção diária registrada.</p> : <div className="scroll-area mt-2 max-h-80" tabIndex={0} role="region" aria-label="Histórico de produções diárias">{data.map((row) => <div className="border-b border-[var(--border)] py-3 last:border-b-0 sm:flex sm:items-center sm:justify-between sm:gap-3" key={row.id}><div><div className="flex flex-wrap items-center gap-2"><strong>{formatDate(row.productionDate)}</strong><Badge>{row.herdGroupName ? `Lote: ${row.herdGroupName}` : 'Rebanho todo'}</Badge></div>{row.morningLiters !== null && row.afternoonLiters !== null ? <span className="block text-sm text-[var(--muted)]">Manhã {formatLiters(row.morningLiters)} · Tarde {formatLiters(row.afternoonLiters)}</span> : row.morningLiters !== null ? <span className="block text-sm text-[var(--muted)]">Manhã {formatLiters(row.morningLiters)} · lote sem ordenha à tarde</span> : <span className="block text-sm text-[var(--muted)]">Registro histórico sem divisão por período</span>}{row.notes && <span className="block text-sm text-[var(--muted)]">{row.notes}</span>}</div><div className="mt-3 sm:mt-0 sm:text-right"><strong className="block text-lg">{formatLiters(row.totalLiters)}</strong><div className="mt-2 grid grid-cols-2 gap-2 sm:flex"><Button variant="secondary" onClick={() => edit(row)}>Editar</Button><ConfirmButton variant="danger" disabled={busy} question="Excluir esta produção diária?" onClick={() => void remove(row.id)}>Excluir</ConfirmButton></div></div></div>)}</div>}</div>
  </SectionCard></div>;
}
