import { useState } from 'react';
import { Check } from 'lucide-react';
import { formatDate } from '../../../domain/format';
import { ErrorState, Field, FormErrorSummary, InlineEmpty, Input, SectionCard, Select, StatusBadge, SubmitBar, Textarea, Button } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import { mastitisDetectionLabel, mastitisOutcomeLabel, mastitisQuarterLabel, mastitisStatusDescriptor, mastitisTimingDescriptor } from '../../lib/status';
import type { ReviewSubmit } from '../game/review';
import { dateFromTimestamp, mastitisAnimalName, noonIso } from './mastitis-utils';

/**
 * Peças reais do fluxo de mastite (extraídas de MastitisPages para serem
 * montadas também dentro das folhas do jogo — Enfermaria e ação no animal).
 * Mastite registra sinal observado, estado escolhido, tratamento informado e
 * resultado: nunca diagnóstico nem protocolo automático (regra de domínio).
 */

export type MastitisAnimal = { id: string; name: string | null; tagNumber: string | null };
export type MastitisWithdrawal = { days: number; state: 'ACTIVE' | 'ENDS_TODAY' | 'PAST_DUE' } | null;
export type MastitisAction = { id: string; scheduledFor: string; actionDescription: string; completedAt: string | null; completionNotes: string | null; cancelledAt: string | null; timing: string };
export type MastitisCase = {
  id: string; animalId: string; animalName: string | null; tagNumber: string | null; detectedAt: string; affectedQuarter: string | null;
  detectionMethod: string | null; observedSigns: string | null; status: string; treatmentSummary: string | null; treatmentStartedAt: string | null;
  treatmentExpectedEndAt: string | null; withdrawalEndsAt: string | null; milkDiscardRequired: boolean; outcome: string | null; notes: string | null;
  resolvedAt: string | null; withdrawal: MastitisWithdrawal; nextAction?: MastitisAction | null;
};
export type MastitisCaseDetail = MastitisCase & { actions: MastitisAction[] };

/** Pré-preenchimento do modo revisão (payload da ação proposta de mastite). */
export type MastitisReviewInitial = {
  animalId: string;
  detectedOn: string;
  observedSigns: string;
  affectedQuarter: string;
  detectionMethod: string;
  notes: string;
};

/** Aviso de carência: a data é informada; o sistema nunca afirma que o leite foi liberado. */
export function WithdrawalNotice({ withdrawalEndsAt, withdrawal }: { withdrawalEndsAt: string | null; withdrawal: MastitisWithdrawal }) {
  if (!withdrawalEndsAt || !withdrawal) return null;
  const detail = withdrawal.state === 'ACTIVE' ? `${withdrawal.days} dia(s) restante(s)` : withdrawal.state === 'ENDS_TODAY' ? 'A data informada termina hoje' : `Data informada passou há ${Math.abs(withdrawal.days)} dia(s)`;
  return <div className={`notice ${withdrawal.state === 'PAST_DUE' ? 'notice-error' : 'notice-warning'}`}><strong>Carência informada até {formatDate(withdrawalEndsAt)}</strong><br />{detail}<br /><span className="text-xs">Confirme o encerramento antes de voltar a utilizar o leite normalmente.</span></div>;
}

export function MastitisCaseForm({ initial, reviewInitial, review, initialAnimalId, onSaved }: {
  initial?: MastitisCaseDetail;
  reviewInitial?: MastitisReviewInitial;
  review?: ReviewSubmit;
  initialAnimalId?: string;
  onSaved: (item: MastitisCase) => void;
}) {
  const { data: animals, loading: loadingAnimals, error: animalError } = useResource<MastitisAnimal[]>('/api/animals');
  const { busy, error, run } = useSubmit();
  const form = useForm(
    {
      animalId: initial?.animalId ?? reviewInitial?.animalId ?? initialAnimalId ?? '',
      detectedOn: dateFromTimestamp(initial?.detectedAt) || reviewInitial?.detectedOn || today(),
      status: initial?.status ?? 'OBSERVATION',
      observedSigns: initial?.observedSigns ?? reviewInitial?.observedSigns ?? '',
      affectedQuarter: initial?.affectedQuarter ?? reviewInitial?.affectedQuarter ?? '',
      detectionMethod: initial?.detectionMethod ?? reviewInitial?.detectionMethod ?? '',
      treatmentSummary: initial?.treatmentSummary ?? '',
      treatmentStartedOn: dateFromTimestamp(initial?.treatmentStartedAt),
      treatmentExpectedEndOn: dateFromTimestamp(initial?.treatmentExpectedEndAt),
      withdrawalEndsAt: initial?.withdrawalEndsAt ?? '',
      milkDiscardRequired: initial?.milkDiscardRequired ?? false,
      outcome: initial?.outcome ?? '',
      notes: initial?.notes ?? reviewInitial?.notes ?? '',
    },
    {
      animalId: (value) => (value ? undefined : 'Escolha o animal.'),
      detectedOn: (value) => (value ? undefined : 'Informe a data em que o sinal foi percebido.'),
      observedSigns: (value, all) => (!value.trim() && !all.notes.trim() ? 'Informe o sinal percebido ou uma observação.' : undefined),
    },
  );
  useUnsavedGuard(form.dirty);

  async function persist() {
    const { animalId, detectedOn, status, observedSigns, affectedQuarter, detectionMethod, treatmentSummary, treatmentStartedOn, treatmentExpectedEndOn, withdrawalEndsAt, milkDiscardRequired, outcome, notes } = form.values;
    const body = {
      animalId, detectedAt: noonIso(detectedOn), status, observedSigns: observedSigns.trim() || null,
      affectedQuarter: affectedQuarter || null, detectionMethod: detectionMethod || null,
      treatmentSummary: treatmentSummary.trim() || null, treatmentStartedAt: treatmentStartedOn ? noonIso(treatmentStartedOn) : null,
      treatmentExpectedEndAt: treatmentExpectedEndOn ? noonIso(treatmentExpectedEndOn) : null, withdrawalEndsAt: withdrawalEndsAt || null,
      milkDiscardRequired, outcome: outcome || null, notes: notes.trim() || null, resolvedAt: initial?.resolvedAt ?? null,
    };
    if (review) {
      await review.onCommit(body);
      return;
    }
    const saved = await api<MastitisCase>(initial ? `/api/mastitis-cases/${initial.id}` : '/api/mastitis-cases', json(initial ? 'PATCH' : 'POST', body));
    onSaved(saved);
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>{(error || animalError) && <ErrorState message={error || animalError} />}<FormErrorSummary errors={form.visibleErrors} />
    <SectionCard title="Registro rápido"><div className="grid gap-3 sm:grid-cols-2"><Field label="Animal" error={form.error('animalId')}><Select value={form.values.animalId} onChange={(event) => form.set('animalId', event.target.value)} onBlur={() => form.blur('animalId')} disabled={loadingAnimals} required><option value="">Selecione</option>{animals?.map((animal) => <option key={animal.id} value={animal.id}>{mastitisAnimalName(animal)}</option>)}</Select></Field><Field label="Data" error={form.error('detectedOn')}><Input type="date" value={form.values.detectedOn} onChange={(event) => form.set('detectedOn', event.target.value)} onBlur={() => form.blur('detectedOn')} required /></Field><Field label="Status inicial"><Select value={form.values.status} onChange={(event) => form.set('status', event.target.value)}>{Object.entries(mastitisStatusDescriptor).map(([value, { label }]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Sinal percebido ou observação" hint="Registre o fato percebido; não é diagnóstico." error={form.error('observedSigns')}><Textarea className="min-h-20" value={form.values.observedSigns} onChange={(event) => form.set('observedSigns', event.target.value)} onBlur={() => form.blur('observedSigns')} placeholder="Ex.: grumos observados no leite" /></Field></div></SectionCard>
    <details className="section-card" open={Boolean(initial)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Mais detalhes</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Teto afetado"><Select value={form.values.affectedQuarter} onChange={(event) => form.set('affectedQuarter', event.target.value)}><option value="">Não informado</option>{Object.entries(mastitisQuarterLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Como foi percebido"><Select value={form.values.detectionMethod} onChange={(event) => form.set('detectionMethod', event.target.value)}><option value="">Não informado</option>{Object.entries(mastitisDetectionLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Tratamento decidido"><Textarea value={form.values.treatmentSummary} onChange={(event) => form.set('treatmentSummary', event.target.value)} placeholder="Registre somente a decisão humana" /></Field><Field label="Início do tratamento"><Input type="date" value={form.values.treatmentStartedOn} onChange={(event) => form.set('treatmentStartedOn', event.target.value)} /></Field><Field label="Fim previsto"><Input type="date" value={form.values.treatmentExpectedEndOn} onChange={(event) => form.set('treatmentExpectedEndOn', event.target.value)} /></Field><Field label="Carência informada até"><Input type="date" value={form.values.withdrawalEndsAt} onChange={(event) => form.set('withdrawalEndsAt', event.target.value)} /></Field><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input className="h-5 w-5" type="checkbox" checked={form.values.milkDiscardRequired} onChange={(event) => form.set('milkDiscardRequired', event.target.checked)} />Descarte de leite informado</label><Field label="Resultado"><Select value={form.values.outcome} onChange={(event) => form.set('outcome', event.target.value)}><option value="">Ainda não informado</option>{Object.entries(mastitisOutcomeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Outras observações"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field></div></details>
    <SubmitBar label={review?.label ?? (initial ? 'Salvar alterações' : 'Abrir caso de mastite')} busy={busy} />
  </form>;
}

/** Ações programadas/concluídas do caso: textos e datas informados pelo usuário. */
export function MastitisActions({ item, reload }: { item: MastitisCaseDetail; reload: () => void }) {
  const { busy, error, setError, run } = useSubmit();
  const form = useForm(
    { scheduledOn: today(), description: '' },
    {
      scheduledOn: (value) => (value ? undefined : 'Informe a data da ação.'),
      description: (value) => (value.trim() ? undefined : 'Informe a ação.'),
    },
  );
  const [editing, setEditing] = useState<MastitisAction | null>(null);
  const [editScheduledOn, setEditScheduledOn] = useState('');
  const [editDescription, setEditDescription] = useState('');
  async function persistAdd() {
    await api(`/api/mastitis-cases/${item.id}/actions`, json('POST', { scheduledFor: noonIso(form.values.scheduledOn), actionDescription: form.values.description }));
    form.reset({ scheduledOn: today(), description: '' });
    reload();
  }
  async function act(id: string, action: string) {
    setError('');
    try { await api(`/api/mastitis-actions/${id}`, json('PATCH', { action })); reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a ação.'); }
  }
  async function saveEdit() {
    if (!editing) return;
    setError('');
    try { await api(`/api/mastitis-actions/${editing.id}`, json('PATCH', { action: 'edit', scheduledFor: noonIso(editScheduledOn), actionDescription: editDescription })); setEditing(null); reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível editar a ação.'); }
  }
  return <SectionCard title="Ações de tratamento">{error && <div className="mb-3"><ErrorState message={error} /></div>}
    {!item.actions.length ? <InlineEmpty>Nenhuma ação programada.</InlineEmpty> : <div>{item.actions.map((action) => <div className="border-b border-[var(--border)] py-3 last:border-b-0" key={action.id}>{editing?.id === action.id ?<div className="grid gap-3 sm:grid-cols-[11rem_1fr_auto]"><Field label="Data"><Input type="date" value={editScheduledOn} onChange={(event) => setEditScheduledOn(event.target.value)} /></Field><Field label="Ação"><Input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></Field><div className="flex items-end gap-2"><Button onClick={() => void saveEdit()}>Salvar</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button></div></div> : <div className="sm:flex sm:items-center sm:justify-between sm:gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong>{action.actionDescription}</strong><StatusBadge descriptor={mastitisTimingDescriptor[action.timing]} /></div><p className="mt-1 text-xs text-[var(--muted)]">{formatDate(dateFromTimestamp(action.scheduledFor))}</p></div><div className="mt-3 flex flex-wrap gap-2 sm:mt-0">{action.timing !== 'COMPLETED' && action.timing !== 'CANCELLED' && <Button onClick={() => void act(action.id, 'complete')}><Check size={16} aria-hidden />Concluir</Button>}{action.timing === 'COMPLETED' && <Button variant="secondary" onClick={() => void act(action.id, 'undo')}>Desfazer</Button>}{action.timing !== 'CANCELLED' && <Button variant="secondary" onClick={() => { setEditing(action); setEditScheduledOn(dateFromTimestamp(action.scheduledFor)); setEditDescription(action.actionDescription); }}>Editar</Button>}{action.timing !== 'CANCELLED' && action.timing !== 'COMPLETED' && <Button variant="danger" onClick={() => void act(action.id, 'cancel')}>Cancelar</Button>}</div></div>}</div>)}</div>}
    <div className="mt-4 border-t border-[var(--border)] pt-4"><FormErrorSummary errors={form.visibleErrors} /><form className="grid gap-3 sm:grid-cols-[11rem_1fr_auto] sm:items-end" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persistAdd); }}><Field label="Data da ação" error={form.error('scheduledOn')}><Input type="date" value={form.values.scheduledOn} onChange={(event) => form.set('scheduledOn', event.target.value)} onBlur={() => form.blur('scheduledOn')} required /></Field><Field label="Ação informada" error={form.error('description')}><Input value={form.values.description} onChange={(event) => form.set('description', event.target.value)} onBlur={() => form.blur('description')} placeholder="Ex.: Reavaliar o leite" required /></Field><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Adicionar ação'}</Button></form></div>
  </SectionCard>;
}
