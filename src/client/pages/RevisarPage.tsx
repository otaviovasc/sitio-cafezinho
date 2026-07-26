import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { FeedUnit } from '../../domain/feeding';
import { formatDate, formatLiters, formatMoney, normalizeLabel } from '../../domain/format';
import type { MilkingRoutine } from '../../domain/herd';
import { resolveFeedQuantity } from '../../domain/nl/resolve';
import { ReviewCard, type ReviewAccent } from '../components/review';
import { useToast } from '../components/feedback-context';
import { ParsedDecimalInput } from '../components/form-controls';
import { Button, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonList, StatusBadge } from '../components/ui';
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
type SupplierOption = { id: string; name: string };
const feedUnitShort: Record<string, string> = { KG: 'kg', LITER: 'L', UNIT: 'un' };
const feedingContextShort: Record<string, string> = { MILKING: 'Ordenha', PASTURE: 'Pasto', STATION: 'Estação' };

function inferredFeedUnit(unitLabel: unknown): FeedUnit | '' {
  const unit = normalizeLabel(String(unitLabel ?? ''));
  if (['kg', 'quilo', 'quilos', 'quilograma', 'quilogramas', 't', 'tonelada', 'toneladas'].includes(unit)) return 'KG';
  if (['l', 'litro', 'litros'].includes(unit)) return 'LITER';
  if (['un', 'unidade', 'unidades'].includes(unit)) return 'UNIT';
  return '';
}

/**
 * A revisão resolve item e fornecedor sem abandonar o documento. Cadastros
 * novos, compra e crédito de estoque são confirmados na mesma transação.
 */
function FeedPurchaseReview({ action, feedItems, suppliers, onDone }: { action: ProposedAction; feedItems: FeedItemOption[]; suppliers: SupplierOption[]; onDone: () => void }) {
  const toast = useToast();
  const payload = action.resolvedPayload ?? {};
  const pending = action.status === 'NEEDS_REVIEW';
  const suggestedNewItemUnit = inferredFeedUnit(payload.spokenUnit);
  const [editing, setEditing] = useState(action.commitStatus !== 'READY');
  const [date, setDate] = useState(String(payload.purchaseDate ?? ''));
  const [feedItemId, setFeedItemId] = useState(payload.feedItemId ? String(payload.feedItemId) : '');
  const [creatingItem, setCreatingItem] = useState(!payload.feedItemId);
  const [newItemName, setNewItemName] = useState(String(payload.itemLabel ?? ''));
  const [newItemUnit, setNewItemUnit] = useState<FeedUnit | ''>(suggestedNewItemUnit);
  const [quantity, setQuantity] = useState<number | null>(() => {
    const resolvedQuantity = num(payload.quantity);
    const spokenQuantity = num(payload.spokenQuantity);
    if (resolvedQuantity !== null || spokenQuantity === null || !suggestedNewItemUnit) return resolvedQuantity;
    return resolveFeedQuantity(spokenQuantity, payload.spokenUnit ? String(payload.spokenUnit) : null, suggestedNewItemUnit).quantity;
  });
  const [amount, setAmount] = useState<number | null>(num(payload.totalAmount));
  const [supplierChoice, setSupplierChoice] = useState(payload.supplierId ? String(payload.supplierId) : payload.supplierLabel ? '' : 'NONE');
  const [newSupplierName, setNewSupplierName] = useState(String(payload.supplierLabel ?? ''));
  const [quantityConfirmed, setQuantityConfirmed] = useState(payload.quantitySource !== 'DOCUMENT_OCR' || payload.quantityConfirmed === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const item = feedItems.find((row) => row.id === feedItemId) ?? null;
  const inactiveMatch = feedItems.find((row) => !row.active && normalizeLabel(row.name) === normalizeLabel(String(payload.itemLabel ?? ''))) ?? null;
  const unit = creatingItem ? newItemUnit : item?.canonicalUnit;
  const requiresSupplierChoice = Boolean(payload.supplierLabel);
  const supplierReady = supplierChoice === 'CREATE' ? Boolean(newSupplierName.trim()) : supplierChoice === 'NONE' || Boolean(supplierChoice);
  const itemReady = creatingItem ? Boolean(newItemName.trim() && newItemUnit) : Boolean(item);
  const canSave = Boolean(date && itemReady && quantity !== null && quantity > 0 && amount !== null && amount > 0 && quantityConfirmed && (!requiresSupplierChoice || supplierReady));

  const itemName = payload.resolvedItemName ? String(payload.resolvedItemName) : `${payload.itemLabel ?? 'item'} (a confirmar)`;
  const spoken = payload.spokenQuantity !== null && payload.spokenQuantity !== undefined ? `${payload.spokenQuantity} ${payload.spokenUnit ?? ''}`.trim() : null;
  const sourceLabel = payload.quantitySource === 'DOCUMENT_OCR' ? 'extraído' : 'dito';
  const subtitle = `${payload.purchaseDate ? formatDate(String(payload.purchaseDate)) : 'Sem data'} · ${itemName}${spoken ? ` · ${sourceLabel}: ${spoken}` : ''}`;

  function applyUnit(nextUnit: FeedUnit) {
    setNewItemUnit(nextUnit);
    const spokenQuantity = num(payload.spokenQuantity);
    if (spokenQuantity === null) return;
    const resolved = resolveFeedQuantity(spokenQuantity, payload.spokenUnit ? String(payload.spokenUnit) : null, nextUnit);
    if (resolved.quantity !== null) setQuantity(resolved.quantity);
  }

  function chooseExistingItem(id: string) {
    setFeedItemId(id);
    setCreatingItem(false);
    const selected = feedItems.find((row) => row.id === id);
    const spokenQuantity = num(payload.spokenQuantity);
    if (!selected || spokenQuantity === null) return;
    const resolved = resolveFeedQuantity(spokenQuantity, payload.spokenUnit ? String(payload.spokenUnit) : null, selected.canonicalUnit);
    if (resolved.quantity !== null) setQuantity(resolved.quantity);
  }

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
        <Field label="Data"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Item do catálogo">
          <Select value={creatingItem ? '' : feedItemId} onChange={(event) => event.target.value && chooseExistingItem(event.target.value)}>
            <option value="">Selecione…</option>
            {feedItems.filter((row) => row.active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </Select>
        </Field>
      </div>

      {!creatingItem && inactiveMatch && inactiveMatch.id !== feedItemId && <Button type="button" variant="secondary" onClick={() => chooseExistingItem(inactiveMatch.id)}>Reativar “{inactiveMatch.name}”</Button>}
      {!creatingItem && !inactiveMatch && <Button type="button" variant="secondary" onClick={() => { setCreatingItem(true); setFeedItemId(''); if (newItemUnit) applyUnit(newItemUnit); }}>Cadastrar “{newItemName || 'novo item'}”</Button>}
      {creatingItem && <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><strong className="block">Novo item do catálogo</strong><span className="text-xs text-[var(--muted)]">Será criado somente ao confirmar esta compra.</span></div>
          {feedItems.some((row) => row.active) && <Button type="button" variant="secondary" onClick={() => setCreatingItem(false)}>Usar existente</Button>}
        </div>
        {inactiveMatch && <div className="mb-3"><Button type="button" variant="secondary" onClick={() => chooseExistingItem(inactiveMatch.id)}>Reativar “{inactiveMatch.name}”</Button></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do item"><Input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} /></Field>
          <Field label="Unidade de controle">
            <Select value={newItemUnit} onChange={(event) => applyUnit(event.target.value as FeedUnit)}>
              <option value="">Selecione…</option>
              <option value="KG">Quilos (kg)</option>
              <option value="LITER">Litros (L)</option>
              <option value="UNIT">Unidades</option>
            </Select>
          </Field>
        </div>
      </div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={unit ? `Quantidade no estoque (${feedUnitShort[unit]})` : 'Quantidade'}>
          <ParsedDecimalInput suffix={unit ? feedUnitShort[unit] : undefined} value={quantity} onValueChange={(next) => { setQuantity(next); if (payload.quantitySource === 'DOCUMENT_OCR') setQuantityConfirmed(false); }} />
        </Field>
        <Field label="Valor total"><ParsedDecimalInput suffix="R$" value={amount} onValueChange={setAmount} /></Field>
      </div>
      {payload.quantitySource === 'DOCUMENT_OCR' && <div className="notice notice-warning">
        <p><strong>Confira o documento.</strong> O OCR informou {spoken ?? 'uma quantidade sem leitura clara'}{payload.rawValueText ? ` (“${String(payload.rawValueText)}”)` : ''}. O valor acima só vira entrada de estoque após sua confirmação.</p>
        <label className="mt-3 flex min-h-11 items-center gap-3 font-semibold">
          <input className="h-5 w-5" type="checkbox" checked={quantityConfirmed} onChange={(event) => setQuantityConfirmed(event.target.checked)} />
          Confirmei quantidade e unidade no documento
        </label>
      </div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fornecedor">
          <Select value={supplierChoice} onChange={(event) => setSupplierChoice(event.target.value)}>
            <option value="">{requiresSupplierChoice ? 'Resolva o fornecedor…' : 'Selecione (opcional)…'}</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            {Boolean(payload.supplierLabel) && <option value="CREATE">Cadastrar “{String(payload.supplierLabel)}”</option>}
            <option value="NONE">Salvar sem fornecedor</option>
          </Select>
        </Field>
        {supplierChoice === 'CREATE' && <Field label="Nome do novo fornecedor"><Input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} /></Field>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !canSave} onClick={() => void run({
          ...payload,
          purchaseDate: date,
          feedItemId: creatingItem ? null : feedItemId,
          reactivateFeedItem: !creatingItem && !item?.active,
          newFeedItem: creatingItem ? { name: newItemName.trim(), canonicalUnit: newItemUnit } : null,
          quantity,
          quantityConfirmed,
          totalAmount: amount,
          supplierId: supplierChoice && !['CREATE', 'NONE'].includes(supplierChoice) ? supplierChoice : null,
          newSupplierName: supplierChoice === 'CREATE' ? newSupplierName.trim() : null,
          supplierResolution: supplierChoice === 'NONE' ? 'NONE' : 'LINKED',
          description: `Compra de ${creatingItem ? newItemName.trim() : item?.name ?? 'alimento'}`,
        })}>{busy ? 'Confirmando…' : 'Confirmar compra'}</Button>
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

function ActionReview({ action, groups, feedItems, suppliers, onDone }: { action: ProposedAction; groups: HerdGroup[]; feedItems: FeedItemOption[]; suppliers: SupplierOption[]; onDone: () => void }) {
  if (action.actionType === 'DAILY_MILK_TOTAL') return <DailyTotalReview action={action} groups={groups} onDone={onDone} />;
  if (action.actionType === 'FEED_PURCHASE') return <FeedPurchaseReview action={action} feedItems={feedItems} suppliers={suppliers} onDone={onDone} />;
  if (action.actionType === 'FEEDING_EVENT') return <FeedingEventReview action={action} groups={groups} feedItems={feedItems} onDone={onDone} />;
  return <GenericReview action={action} onDone={onDone} />;
}

export function RevisarPage() {
  const { data, loading, error, reload } = useResource<Capture[]>('/api/captures');
  const { data: groupsData } = useResource<HerdGroup[]>('/api/herd-groups');
  const { data: feedItemsData } = useResource<FeedItemOption[]>('/api/feed-items');
  const { data: suppliersData } = useResource<SupplierOption[]>('/api/suppliers');
  const feedItems = feedItemsData ?? [];
  const suppliers = suppliersData ?? [];
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
                  ? capture.actions.map((action) => <ActionReview key={action.id} action={action} groups={groups} feedItems={feedItems} suppliers={suppliers} onDone={reload} />)
                  : <p className="text-sm text-[var(--muted)]">Nenhuma ação reconhecida nesta captura.</p>}
              </div>)}
            </section>)}
          </div>}
  </div>;
}
