import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, MapPinned, Pencil, Plus, Trees } from 'lucide-react';
import { formatDate, parseDecimal } from '../../domain/format';
import type { GameMapState } from '../../domain/game/state';
import { ConfirmButton, Modal } from '../components/feedback';
import { useToast } from '../components/feedback-context';
import { Badge, Button, EmptyState, ErrorState, Field, FormErrorSummary, Input, PageHeader, ScrollArea, SectionCard, SkeletonList } from '../components/ui';
import { DecimalInput } from '../components/form-controls';
import { useForm } from '../hooks/useForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { api, json } from '../lib/api';
import type { PastureOccupancyRecord, PastureSummary } from '../features/pastures/types';

function formatArea(areaHa: string | null) {
  if (!areaHa) return null;
  const parsed = Number(areaHa);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha` : `${areaHa} ha`;
}

function daysLabel(days: number) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** Situação atual do pasto em uma linha: quem ocupa ou há quanto tempo descansa. */
function pastureSituation(pasture: PastureSummary) {
  if (pasture.currentOccupancy) return `${pasture.currentOccupancy.herdGroupName} há ${daysLabel(pasture.currentOccupancy.occupiedDays)}`;
  if (pasture.restDays === null) return 'Nunca ocupado';
  return `Em descanso há ${daysLabel(pasture.restDays)}`;
}

function PastureForm({ initial, onSaved, onCancel }: { initial?: PastureSummary; onSaved: () => void | Promise<void>; onCancel: () => void }) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const form = useForm(
    { name: initial?.name ?? '', areaHa: initial?.areaHa ?? '' },
    {
      name: (value) => (value.trim() ? undefined : 'Informe o nome do pasto.'),
      areaHa: (value) => {
        if (!value.trim()) return undefined;
        const parsed = parseDecimal(value);
        return parsed !== null && parsed > 0 ? undefined : 'Informe uma área maior que zero.';
      },
    },
  );

  async function persist() {
    const body = { name: form.values.name.trim(), areaHa: parseDecimal(form.values.areaHa) };
    await api(initial ? `/api/pastures/${initial.id}` : '/api/pastures', json(initial ? 'PATCH' : 'POST', body));
    toast(initial ? 'Pasto atualizado' : 'Pasto criado');
    await onSaved();
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <Field label="Nome do pasto" error={form.error('name')}><Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} onBlur={() => form.blur('name')} required autoFocus placeholder="Ex.: Pasto da entrada" /></Field>
    <Field label="Área (opcional)" error={form.error('areaHa')}><DecimalInput value={form.values.areaHa} suffix="ha" maximumFractionDigits={2} onValueChange={(value) => form.set('areaHa', value)} onBlur={() => form.blur('areaHa')} /></Field>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : initial ? 'Salvar alterações' : 'Criar pasto'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}

function PastureHistory({ pasture }: { pasture: PastureSummary }) {
  const { data, loading, error, reload } = useResource<PastureOccupancyRecord[]>(`/api/pastures/${pasture.id}/occupancies`);
  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data?.length) return <EmptyState title="Sem rotação registrada" description="Nenhum lote ocupou este pasto ainda." />;
  return <ScrollArea label={`Histórico de rotação de ${pasture.name}`} className="max-h-96">
    {data.map((row) => <div className="mobile-item" key={row.id}><span><strong>{row.herdGroupName}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(row.startedOn)}{row.endedOn ? ` até ${formatDate(row.endedOn)}` : ' até hoje'}</span>{row.notes && <span className="block text-xs text-[var(--muted)]">{row.notes}</span>}</span></div>)}
  </ScrollArea>;
}

/**
 * Pastos reais do sítio: quem ocupa cada um (ou há quanto tempo descansa) e a
 * rotação registrada. Subdividir um pasto = desativar o antigo e criar novos.
 */
export function PasturesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useResource<PastureSummary[]>('/api/pastures');
  const { data: gameMap } = useResource<GameMapState>('/api/game/map');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PastureSummary | null>(null);
  const [historyOf, setHistoryOf] = useState<PastureSummary | null>(null);
  const [actionError, setActionError] = useState('');

  async function setActive(pasture: PastureSummary, active: boolean) {
    setActionError('');
    try {
      await api(`/api/pastures/${pasture.id}`, json('PATCH', { active }));
      toast(active ? 'Pasto reativado' : 'Pasto desativado');
      await reload(false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o pasto.');
    }
  }

  const pastures = data ?? [];
  const active = pastures.filter((pasture) => pasture.active);
  const inactive = pastures.filter((pasture) => !pasture.active);
  const drawnPastureIds = new Set((gameMap?.zones ?? []).map((zone) => zone.pastureId).filter(Boolean));

  const row = (pasture: PastureSummary) => <div className="mobile-item items-start" key={pasture.id} data-testid={`pasture-card-${pasture.id}`}>
    <span className="min-w-0">
      <strong className="block truncate">{pasture.name}</strong>
      <span className="block text-xs text-[var(--muted)]">{[formatArea(pasture.areaHa), pasture.active ? pastureSituation(pasture) : null].filter(Boolean).join(' · ')}</span>
    </span>
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {!pasture.active && <Badge tone="neutral">Desativado</Badge>}
      {pasture.active && !drawnPastureIds.has(pasture.id) && <Button variant="secondary" aria-label={`Desenhar ${pasture.name} no mapa`} title="Desenhar no mapa" onClick={() => navigate(`/jogo/mapa/editor?pasto=${pasture.id}`)}><MapPinned size={15} aria-hidden /></Button>}
      <Button variant="secondary" aria-label={`Histórico de ${pasture.name}`} onClick={() => setHistoryOf(pasture)}><History size={15} aria-hidden /></Button>
      <Button variant="secondary" aria-label={`Editar ${pasture.name}`} onClick={() => setEditing(pasture)}><Pencil size={15} aria-hidden /></Button>
      {pasture.active
        ? <ConfirmButton variant="danger" question={pasture.currentOccupancy ? `“${pasture.name}” está ocupado por ${pasture.currentOccupancy.herdGroupName}. Retire o lote antes de desativar.` : `Desativar “${pasture.name}”? Para subdividir, desative e crie os novos pastos.`} onClick={() => void setActive(pasture, false)}>Desativar</ConfirmButton>
        : <Button variant="secondary" onClick={() => void setActive(pasture, true)}>Reativar</Button>}
    </span>
  </div>;

  return <div className="page">
    <PageHeader icon={Trees} title="Pastos" subtitle="Ocupação real de cada pasto e a rotação dos lotes" action={<Button onClick={() => setShowCreate(true)}><Plus size={18} aria-hidden />Novo pasto</Button>} />
    {actionError && <div className="mb-4"><ErrorState message={actionError} /></div>}
    <Modal open={showCreate} title="Novo pasto" onClose={() => setShowCreate(false)}>
      <PastureForm onCancel={() => setShowCreate(false)} onSaved={async () => { await reload(false); setShowCreate(false); }} />
    </Modal>
    <Modal open={Boolean(editing)} title={`Editar ${editing?.name ?? 'pasto'}`} onClose={() => setEditing(null)}>
      {editing && <PastureForm initial={editing} onCancel={() => setEditing(null)} onSaved={async () => { await reload(false); setEditing(null); }} />}
    </Modal>
    <Modal open={Boolean(historyOf)} title={`Rotação — ${historyOf?.name ?? 'pasto'}`} onClose={() => setHistoryOf(null)}>
      {historyOf && <PastureHistory pasture={historyOf} />}
    </Modal>
    {loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} retry={reload} /> : !pastures.length
      ? <EmptyState title="Nenhum pasto cadastrado" description="Cadastre o primeiro pasto para registrar a rotação dos lotes." action={<Button onClick={() => setShowCreate(true)}><Plus size={17} aria-hidden />Novo pasto</Button>} />
      : <>
        <SectionCard title="Pastos ativos">{active.length ? active.map(row) : <EmptyState title="Nenhum pasto ativo" description="Reative um pasto abaixo ou crie um novo." />}</SectionCard>
        {inactive.length > 0 && <SectionCard title="Desativados" className="mt-5">{inactive.map(row)}</SectionCard>}
      </>}
  </div>;
}
