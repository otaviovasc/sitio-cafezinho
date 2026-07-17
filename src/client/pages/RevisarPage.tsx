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

function ActionReview({ action, groups, onDone }: { action: ProposedAction; groups: HerdGroup[]; onDone: () => void }) {
  if (action.actionType === 'DAILY_MILK_TOTAL') return <DailyTotalReview action={action} groups={groups} onDone={onDone} />;
  return <GenericReview action={action} onDone={onDone} />;
}

export function RevisarPage() {
  const { data, loading, error, reload } = useResource<Capture[]>('/api/captures');
  const { data: groupsData } = useResource<HerdGroup[]>('/api/herd-groups');
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
                  ? capture.actions.map((action) => <ActionReview key={action.id} action={action} groups={groups} onDone={reload} />)
                  : <p className="text-sm text-[var(--muted)]">Nenhuma ação reconhecida nesta captura.</p>}
              </div>)}
            </section>)}
          </div>}
  </div>;
}
