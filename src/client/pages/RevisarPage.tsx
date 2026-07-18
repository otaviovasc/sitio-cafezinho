import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatLiters, formatMoney } from '../../domain/format';
import type { MilkingRoutine } from '../../domain/herd';
import { ReviewCard, type ReviewAccent } from '../components/review';
import { useToast } from '../components/feedback-context';
import { ParsedDecimalInput } from '../components/form-controls';
import { Button, EmptyState, ErrorState, Field, PageHeader, Select, SkeletonList, StatusBadge } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api, ApiError, json } from '../lib/api';
import { captureInputKindLabel, commitStatusDescriptor, proposedActionStatusDescriptor, proposedActionTypeLabel } from '../lib/status';

type ProposedAction = {
  id: string;
  captureId: string;
  actionType: string;
  resolvedPayload: Record<string, unknown> | null;
  issues: string[] | null;
  commitStatus: string;
  status: string;
};

type Capture = {
  id: string;
  inputKind: string;
  status: string;
  transcript: string | null;
  createdAt: string;
  actions: ProposedAction[];
};

type HerdGroup = { id: string; name: string; milkingRoutine: MilkingRoutine; active: boolean };

function accentFor(action: ProposedAction): ReviewAccent {
  if (action.status === 'CONFIRMED') return 'ok';
  if (action.status === 'DISMISSED' || action.status === 'FAILED') return 'dismissed';
  return 'action';
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : value === null || value === undefined || value === '' ? null : Number(value);
}

async function dismiss(action: ProposedAction) {
  await api(`/api/captures/${action.captureId}/actions/${action.id}/dismiss`, json('POST'));
}

function DailyTotalReview({ action, groups, onDone }: { action: ProposedAction; groups: HerdGroup[]; onDone: () => void }) {
  const toast = useToast();
  const payload = action.resolvedPayload ?? {};
  const pending = action.status === 'NEEDS_REVIEW';
  const [editing, setEditing] = useState(action.commitStatus !== 'READY');
  const [date, setDate] = useState(String(payload.productionDate ?? ''));
  const [groupId, setGroupId] = useState(payload.herdGroupId ? String(payload.herdGroupId) : '');
  const [morning, setMorning] = useState<number | null>(num(payload.morningLiters));
  const [afternoon, setAfternoon] = useState<number | null>(num(payload.afternoonLiters));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const scopeName = payload.resolvedGroupName ? String(payload.resolvedGroupName) : payload.scopeLabel ? `${payload.scopeLabel} (a confirmar)` : 'Rebanho todo';
  const m = num(payload.morningLiters);
  const a = num(payload.afternoonLiters);
  const summary = `${payload.productionDate ? formatDate(String(payload.productionDate)) : 'Sem data'} · ${scopeName}`;
  const value = m !== null || a !== null ? `${m !== null ? `M ${formatLiters(m)}` : ''}${m !== null && a !== null ? ' · ' : ''}${a !== null ? `T ${formatLiters(a)}` : ''}` : '—';

  async function run(override?: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/captures/${action.captureId}/actions/${action.id}/commit`, json('POST', override ? { payload: override } : undefined));
      toast('Produção salva');
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar.');
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try { await dismiss(action); toast('Descartado'); onDone(); } catch { setBusy(false); }
  }

  const badge = pending
    ? <StatusBadge descriptor={commitStatusDescriptor[action.commitStatus] ?? commitStatusDescriptor.NEEDS_REVIEW} />
    : <StatusBadge descriptor={proposedActionStatusDescriptor[action.status] ?? proposedActionStatusDescriptor.NEEDS_REVIEW} />;

  return <ReviewCard
    accent={accentFor(action)}
    title={proposedActionTypeLabel.DAILY_MILK_TOTAL}
    subtitle={summary}
    value={value}
    badge={badge}
    issues={pending ? (action.issues ?? []) : []}
    actions={!pending ? undefined : <>
      {action.commitStatus === 'READY' && !editing && <Button disabled={busy} onClick={() => void run()}>Confirmar</Button>}
      {!editing && <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>Corrigir</Button>}
      <Button variant="danger" disabled={busy} onClick={() => void remove()}>Descartar</Button>
    </>}
  >
    {pending && editing && <div className="grid gap-3">
      {error && <ErrorState message={error} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data"><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Lote"><Select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Rebanho todo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field>
        <Field label="Manhã (L)"><ParsedDecimalInput suffix="L" value={morning} onValueChange={setMorning} /></Field>
        <Field label="Tarde (L)"><ParsedDecimalInput suffix="L" value={afternoon} onValueChange={setAfternoon} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !date} onClick={() => void run({ productionDate: date, herdGroupId: groupId || null, morningLiters: morning, afternoonLiters: afternoon, notes: payload.notes ?? null })}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
      </div>
    </div>}
  </ReviewCard>;
}

const DIRECT_COMMIT = new Set(['MILK_COLLECTION', 'REVENUE', 'PURCHASE', 'MASTITIS_CASE']);

type FeedItemOption = { id: string; name: string; canonicalUnit: 'KG' | 'LITER' | 'UNIT'; active: boolean };
const feedUnitShort: Record<string, string> = { KG: 'kg', LITER: 'L', UNIT: 'un' };
const feedingContextShort: Record<string, string> = { MILKING: 'Ordenha', PASTURE: 'Pasto', STATION: 'Estação' };

/**
 * Compra de alimento falada: revisa item, quantidade (na unidade canônica) e
 * valor. Confirmar cria a compra real + o crédito de estoque numa transação.
 */
function FeedPurchaseReview({ action, feedItems, onDone }: { action: ProposedAction; feedItems: FeedItemOption[]; onDone: () => void }) {
  const toast = useToast();
  const payload = action.resolvedPayload ?? {};
  const pending = action.status === 'NEEDS_REVIEW';
  const [editing, setEditing] = useState(action.commitStatus !== 'READY');
  const [date, setDate] = useState(String(payload.purchaseDate ?? ''));
  const [feedItemId, setFeedItemId] = useState(payload.feedItemId ? String(payload.feedItemId) : '');
  const [quantity, setQuantity] = useState<number | null>(num(payload.quantity));
  const [amount, setAmount] = useState<number | null>(num(payload.totalAmount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const item = feedItems.find((row) => row.id === feedItemId) ?? null;

  const itemName = payload.resolvedItemName ? String(payload.resolvedItemName) : `${payload.itemLabel ?? 'item'} (a confirmar)`;
  const spoken = payload.spokenQuantity !== null && payload.spokenQuantity !== undefined ? `${payload.spokenQuantity} ${payload.spokenUnit ?? ''}`.trim() : null;
  const subtitle = `${payload.purchaseDate ? formatDate(String(payload.purchaseDate)) : 'Sem data'} · ${itemName}${spoken ? ` · dito: ${spoken}` : ''}`;

  async function run(override?: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/captures/${action.captureId}/actions/${action.id}/commit`, json('POST', override ? { payload: override } : undefined));
      toast('Compra de alimento salva');
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar.');
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try { await dismiss(action); toast('Descartado'); onDone(); } catch { setBusy(false); }
  }

  const badge = pending
    ? <StatusBadge descriptor={commitStatusDescriptor[action.commitStatus] ?? commitStatusDescriptor.NEEDS_REVIEW} />
    : <StatusBadge descriptor={proposedActionStatusDescriptor[action.status] ?? proposedActionStatusDescriptor.NEEDS_REVIEW} />;

  return <ReviewCard
    accent={accentFor(action)}
    title={proposedActionTypeLabel.FEED_PURCHASE}
    subtitle={subtitle}
    value={num(payload.totalAmount) !== null ? formatMoney(num(payload.totalAmount)!) : '—'}
    badge={badge}
    issues={pending ? (action.issues ?? []) : []}
    actions={!pending ? undefined : <>
      {action.commitStatus === 'READY' && !editing && <Button disabled={busy} onClick={() => void run()}>Confirmar</Button>}
      {!editing && <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>Corrigir</Button>}
      <Button variant="danger" disabled={busy} onClick={() => void remove()}>Descartar</Button>
    </>}
  >
    {pending && editing && <div className="grid gap-3">
      {error && <ErrorState message={error} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data"><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Item do catálogo"><Select value={feedItemId} onChange={(event) => setFeedItemId(event.target.value)}><option value="">Selecione…</option>{feedItems.filter((row) => row.active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
        <Field label="Quantidade"><ParsedDecimalInput suffix={item ? feedUnitShort[item.canonicalUnit] : undefined} value={quantity} onValueChange={setQuantity} /></Field>
        <Field label="Valor total"><ParsedDecimalInput suffix="R$" value={amount} onValueChange={setAmount} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !date || !feedItemId || !quantity || !amount} onClick={() => void run({ ...payload, purchaseDate: date, feedItemId, quantity, totalAmount: amount, description: `Compra de ${item?.name ?? 'alimento'}` })}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
      </div>
    </div>}
  </ReviewCard>;
}

type FeedingReviewLine = { feedItemId: string; quantity: number | null; label: string };

/**
 * Trato falado: revisa contexto, lote e as linhas item+quantidade (já na
 * unidade canônica; toneladas foram convertidas no resolvedor).
 */
function FeedingEventReview({ action, groups, feedItems, onDone }: { action: ProposedAction; groups: HerdGroup[]; feedItems: FeedItemOption[]; onDone: () => void }) {
  const toast = useToast();
  const payload = action.resolvedPayload ?? {};
  const pending = action.status === 'NEEDS_REVIEW';
  const payloadItems = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
  const [editing, setEditing] = useState(action.commitStatus !== 'READY');
  const [date, setDate] = useState(String(payload.date ?? ''));
  const [context, setContext] = useState(payload.context ? String(payload.context) : '');
  const [groupId, setGroupId] = useState(payload.herdGroupId ? String(payload.herdGroupId) : '');
  const [lines, setLines] = useState<FeedingReviewLine[]>(payloadItems.map((item) => ({
    feedItemId: item.feedItemId ? String(item.feedItemId) : '',
    quantity: num(item.quantity),
    label: String(item.itemLabel ?? item.resolvedItemName ?? 'item'),
  })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const contextName = payload.context ? feedingContextShort[String(payload.context)] ?? String(payload.context) : `${payload.contextLabel ?? 'onde?'} (a confirmar)`;
  const scopeName = payload.resolvedGroupName ? String(payload.resolvedGroupName) : payload.scopeLabel ? `${payload.scopeLabel} (a confirmar)` : null;
  const subtitle = `${payload.date ? formatDate(String(payload.date)) : 'Sem data'} · ${contextName}${scopeName ? ` · ${scopeName}` : ''}`;
  const value = payloadItems.map((item) => `${item.resolvedItemName ?? item.itemLabel} ${item.quantity ?? '?'}${item.canonicalUnit ? feedUnitShort[String(item.canonicalUnit)] : ''}`).join(' · ') || '—';

  async function run(override?: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/captures/${action.captureId}/actions/${action.id}/commit`, json('POST', override ? { payload: override } : undefined));
      toast('Trato salvo');
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar.');
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try { await dismiss(action); toast('Descartado'); onDone(); } catch { setBusy(false); }
  }

  const badge = pending
    ? <StatusBadge descriptor={commitStatusDescriptor[action.commitStatus] ?? commitStatusDescriptor.NEEDS_REVIEW} />
    : <StatusBadge descriptor={proposedActionStatusDescriptor[action.status] ?? proposedActionStatusDescriptor.NEEDS_REVIEW} />;
  const canSave = Boolean(date) && ['MILKING', 'PASTURE', 'STATION'].includes(context)
    && (context !== 'MILKING' || Boolean(groupId))
    && lines.length > 0 && lines.every((line) => line.feedItemId && line.quantity !== null && line.quantity > 0);

  return <ReviewCard
    accent={accentFor(action)}
    title={proposedActionTypeLabel.FEEDING_EVENT}
    subtitle={subtitle}
    value={value}
    badge={badge}
    issues={pending ? (action.issues ?? []) : []}
    actions={!pending ? undefined : <>
      {action.commitStatus === 'READY' && !editing && <Button disabled={busy} onClick={() => void run()}>Confirmar</Button>}
      {!editing && <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>Corrigir</Button>}
      <Button variant="danger" disabled={busy} onClick={() => void remove()}>Descartar</Button>
    </>}
  >
    {pending && editing && <div className="grid gap-3">
      {error && <ErrorState message={error} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Data"><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Onde"><Select value={context} onChange={(event) => setContext(event.target.value)}><option value="">Selecione…</option><option value="MILKING">Ordenha</option><option value="STATION">Estação</option><option value="PASTURE">Pasto</option></Select></Field>
        <Field label={context === 'MILKING' ? 'Lote' : 'Lote (opcional)'}><Select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">{context === 'MILKING' ? 'Selecione…' : 'Rebanho todo'}</option>{groups.filter((group) => group.active && (context !== 'MILKING' || group.milkingRoutine !== 'NOT_MILKED')).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field>
      </div>
      {lines.map((line, index) => {
        const lineItem = feedItems.find((row) => row.id === line.feedItemId) ?? null;
        return <div key={index} className="grid gap-3 sm:grid-cols-2">
          <Field label={`Item dito: “${line.label}”`}><Select value={line.feedItemId} onChange={(event) => setLines(lines.map((current, position) => (position === index ? { ...current, feedItemId: event.target.value } : current)))}><option value="">Selecione…</option>{feedItems.filter((row) => row.active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
          <Field label="Quantidade"><ParsedDecimalInput suffix={lineItem ? feedUnitShort[lineItem.canonicalUnit] : undefined} value={line.quantity} onValueChange={(next) => setLines(lines.map((current, position) => (position === index ? { ...current, quantity: next } : current)))} /></Field>
        </div>;
      })}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !canSave} onClick={() => void run({ ...payload, date, context, herdGroupId: groupId || null, items: lines.map((line) => ({ feedItemId: line.feedItemId, quantity: line.quantity })) })}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
      </div>
    </div>}
  </ReviewCard>;
}

function summarize(action: ProposedAction): { subtitle: string | undefined; value: string | undefined } {
  const p = action.resolvedPayload ?? {};
  const day = (value: unknown) => (value ? formatDate(String(value)) : 'Sem data');
  const money = (value: unknown) => { const n = num(value); return n !== null ? formatMoney(n) : '—'; };
  switch (action.actionType) {
    case 'MILK_COLLECTION': {
      const liters = num(p.liters);
      return { subtitle: day(p.collectionDate), value: liters !== null ? formatLiters(liters) : '—' };
    }
    case 'REVENUE':
      return { subtitle: `${day(p.revenueDate)} · ${p.description ?? ''}`, value: money(p.amount) };
    case 'PURCHASE':
      return { subtitle: `${day(p.purchaseDate)} · ${p.description ?? ''}`, value: money(p.totalAmount) };
    case 'MASTITIS_CASE':
      return { subtitle: `${day(p.detectedAt)} · ${p.animalName ?? p.animalLabel ?? 'animal'}`, value: undefined };
    case 'INDIVIDUAL_MILK_SESSION': {
      const imp = p.import as { sessionDate?: string; measurements?: unknown[] } | undefined;
      return { subtitle: `${imp?.sessionDate ? formatDate(imp.sessionDate) : 'Sem data'} · ${imp?.measurements?.length ?? 0} vaca(s)`, value: undefined };
    }
    case 'UNKNOWN':
      return { subtitle: String(p.reason ?? 'Fala não reconhecida'), value: undefined };
    default:
      return { subtitle: undefined, value: undefined };
  }
}

function GenericReview({ action, onDone }: { action: ProposedAction; onDone: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const payload = action.resolvedPayload ?? {};
  const pending = action.status === 'NEEDS_REVIEW';
  const isIndividual = action.actionType === 'INDIVIDUAL_MILK_SESSION';
  const importData = payload.import as { sessionDate?: string; measurements?: unknown[] } | undefined;
  const { subtitle, value } = summarize(action);
  const canConfirm = DIRECT_COMMIT.has(action.actionType) && action.commitStatus === 'READY';

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/captures/${action.captureId}/actions/${action.id}/commit`, json('POST'));
      toast('Salvo');
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar.');
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try { await dismiss(action); toast('Descartado'); onDone(); } catch { setBusy(false); }
  }

  const badge = pending && DIRECT_COMMIT.has(action.actionType)
    ? <StatusBadge descriptor={commitStatusDescriptor[action.commitStatus] ?? commitStatusDescriptor.NEEDS_REVIEW} />
    : <StatusBadge descriptor={proposedActionStatusDescriptor[action.status] ?? proposedActionStatusDescriptor.NEEDS_REVIEW} />;

  return <ReviewCard
    accent={accentFor(action)}
    title={proposedActionTypeLabel[action.actionType] ?? action.actionType}
    subtitle={subtitle}
    value={value}
    badge={badge}
    issues={pending ? (action.issues ?? []) : []}
    actions={!pending ? undefined : <>
      {canConfirm && <Button disabled={busy} onClick={() => void confirm()}>Confirmar</Button>}
      {isIndividual && importData && <Button onClick={() => navigate('/producao/importar', { state: { prefillJson: JSON.stringify(importData) } })}>Revisar e importar</Button>}
      <Button variant="danger" disabled={busy} onClick={() => void remove()}>Descartar</Button>
    </>}
  >
    {error ? <ErrorState message={error} /> : undefined}
  </ReviewCard>;
}

function ActionReview({ action, groups, feedItems, onDone }: { action: ProposedAction; groups: HerdGroup[]; feedItems: FeedItemOption[]; onDone: () => void }) {
  if (action.actionType === 'DAILY_MILK_TOTAL') return <DailyTotalReview action={action} groups={groups} onDone={onDone} />;
  if (action.actionType === 'FEED_PURCHASE') return <FeedPurchaseReview action={action} feedItems={feedItems} onDone={onDone} />;
  if (action.actionType === 'FEEDING_EVENT') return <FeedingEventReview action={action} groups={groups} feedItems={feedItems} onDone={onDone} />;
  return <GenericReview action={action} onDone={onDone} />;
}

export function RevisarPage() {
  const { data, loading, error, reload } = useResource<Capture[]>('/api/captures');
  const { data: groupsData } = useResource<HerdGroup[]>('/api/herd-groups');
  const { data: feedItemsData } = useResource<FeedItemOption[]>('/api/feed-items');
  const feedItems = feedItemsData ?? [];
  const groups = groupsData ?? [];
  const captures = data ?? [];
  const pendingCount = captures.reduce((sum, capture) => sum + capture.actions.filter((action) => action.status === 'NEEDS_REVIEW').length, 0);

  const byDay = new Map<string, Capture[]>();
  for (const capture of captures) {
    const day = capture.createdAt.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(capture);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort((first, second) => second.localeCompare(first));

  return <div className="page">
    <PageHeader icon={ClipboardCheck} title="Revisar" subtitle={pendingCount ? `${pendingCount} ação(ões) aguardando você` : 'Tudo em dia'} />
    {loading ? <SkeletonList rows={4} />
      : error ? <ErrorState message={error} retry={reload} />
        : !captures.length ? <EmptyState title="Nada para revisar" description="Registre uma captura por voz, foto ou texto e ela aparece aqui para conferência antes de virar fato." />
          : <div className="grid gap-6">
            {days.map((day) => <section key={day} className="grid gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">{formatDate(day)}</h2>
              {(byDay.get(day) ?? []).map((capture) => <div key={capture.id} className="grid gap-2">
                {capture.transcript && <p className="text-sm text-[var(--muted)]"><span className="font-semibold">{captureInputKindLabel[capture.inputKind] ?? capture.inputKind}:</span> “{capture.transcript}”</p>}
                {capture.actions.length
                  ? capture.actions.map((action) => <ActionReview key={action.id} action={action} groups={groups} feedItems={feedItems} onDone={reload} />)
                  : <p className="text-sm text-[var(--muted)]">Nenhuma ação reconhecida nesta captura.</p>}
              </div>)}
            </section>)}
          </div>}
  </div>;
}
