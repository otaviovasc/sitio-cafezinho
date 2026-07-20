import { useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { AnimalSex, AnimalStatus } from '../../../domain/animal-lifecycle';
import { allowedNextStatuses, isLiveStatus, statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select, Textarea } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import { animalSexLabels, animalStatusLabels, today } from '../../lib/labels';
import { useResource } from '../../hooks/useResource';
import { formatMoney, parseDecimal } from '../../../domain/format';
import { MoneyInput, WeightInput } from '../../components/form-controls';
import { GroupPicker } from './GroupPicker';
import { milkingGroupRoutines } from './group-routines';
import { useToast } from '../../components/feedback-context';

type HerdAnimal = { id: string; name: string | null; tagNumber: string | null; status: AnimalStatus; sex: AnimalSex };

type StatusChangeResult = {
  id: string;
  calfId: string | null;
  suggestedGroup: { id: string; name: string } | null;
};

type Props = {
  animalId: string;
  currentStatus: AnimalStatus;
  initialStatus?: AnimalStatus;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
};

export function AnimalStatusChangeForm({ animalId, currentStatus, initialStatus, onSaved, onCancel }: Props) {
  const toast = useToast();
  const choices = allowedNextStatuses(currentStatus);
  const suggested = choices[0] ?? currentStatus;
  const { busy, error, run } = useSubmit();
  const { data: revenues } = useResource<Array<{ id: string; description: string; amount: string; status: string; animalId: string | null }>>('/api/revenues');
  const { data: herd = [] } = useResource<HerdAnimal[]>('/api/animals');
  const sires = (herd ?? []).filter((animal) => animal.status === 'BULL');
  // Saída de lactação: lote sem ordenha sugerido pelo backend, confirmado num segundo passo.
  const [suggestedGroup, setSuggestedGroup] = useState<{ id: string; name: string } | null>(null);
  const [savedChangedOn, setSavedChangedOn] = useState('');
  const form = useForm(
    {
      status: (initialStatus && choices.includes(initialStatus) ? initialStatus : suggested) as AnimalStatus,
      changedOn: today(),
      notes: '',
      groupId: '',
      exitType: 'OTHER',
      reason: '',
      buyerName: '',
      weightKg: '',
      amount: '',
      createRevenue: false,
      existingRevenueId: '',
      registerCalf: false,
      calfName: '',
      calfTag: '',
      calfSex: 'FEMALE' as AnimalSex,
      calfSireId: '',
    },
    {
      changedOn: (value) => (value ? undefined : 'Informe a data da mudança.'),
      groupId: (value, all) => (statusRequiresMilkingGroup(all.status) && !value ? 'Selecione o lote de ordenha.' : undefined),
      notes: (value, all) => ((all.status === 'SOLD' || all.status === 'DEAD') && !value.trim() ? 'Informe o motivo ou uma observação para o histórico.' : undefined),
      amount: (value, all) => {
        const parsed = parseDecimal(value);
        return all.status === 'SOLD' && all.createRevenue && (parsed === null || parsed <= 0) ? 'Informe um valor recebido maior que zero.' : undefined;
      },
      calfName: (value, all) => (all.registerCalf && !value.trim() && !all.calfTag.trim() ? 'Informe o nome ou o brinco do bezerro.' : undefined),
    },
  );
  const { status } = form.values;

  async function persist() {
    const { changedOn, notes, groupId, exitType, reason, buyerName, weightKg, amount, createRevenue, existingRevenueId, registerCalf, calfName, calfTag, calfSex, calfSireId } = form.values;
    const exit = status === 'SOLD' ? {
      exitType, reason: reason.trim() || notes.trim() || null, buyerName: buyerName.trim() || null,
      weightKg: parseDecimal(weightKg), amount: parseDecimal(amount), createRevenue, existingRevenueId: existingRevenueId || null, notes: notes.trim() || null,
    } : status === 'DEAD' ? { reason: reason.trim() || notes.trim() || null, weightKg: parseDecimal(weightKg), notes: notes.trim() || null } : null;
    const calf = registerCalf ? { name: calfName.trim() || null, tagNumber: calfTag.trim() || null, sex: calfSex, sireId: calfSireId || null } : null;
    const result = await api<StatusChangeResult>(`/api/animals/${animalId}/status-changes`, json('POST', { status, changedOn, notes: notes.trim() || null, groupId: statusRequiresMilkingGroup(status) ? groupId : null, exit, calf }));
    if (result.suggestedGroup && isLiveStatus(status)) {
      setSavedChangedOn(changedOn);
      setSuggestedGroup(result.suggestedGroup);
      return;
    }
    toast(result.calfId ? 'Parto e bezerro registrados' : 'Situação do animal atualizada');
    await onSaved();
  }

  if (suggestedGroup) {
    return <div className="grid gap-3">
      {error && <ErrorState message={error} />}
      <div className="notice notice-info flex gap-2"><RefreshCw className="mt-0.5 shrink-0" size={17} aria-hidden /><span>Situação registrada. O lote <strong>{suggestedGroup.name}</strong> (sem ordenha) pode abrigar o animal fora da lactação.</span></div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void run(async () => {
          await api(`/api/animals/${animalId}/group-assignments`, json('POST', { groupId: suggestedGroup.id, startedOn: savedChangedOn, notes: null }));
          toast(`Animal movido para ${suggestedGroup.name}`);
          await onSaved();
        })}>{busy ? 'Movendo…' : `Mover para ${suggestedGroup.name}`}</Button>
        <Button variant="secondary" onClick={() => void onSaved()}>Manter sem lote</Button>
      </div>
    </div>;
  }

  return <form className="grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <div className="notice notice-info flex gap-2"><RefreshCw className="mt-0.5 shrink-0" size={17} aria-hidden /><span>A mudança fica registrada no histórico. Ao sair de lactação, o lote de ordenha é encerrado.</span></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nova situação"><Select value={status} onChange={(event) => form.set('status', event.target.value as AnimalStatus)}>{choices.map((value) => <option key={value} value={value}>{animalStatusLabels[value]}</option>)}</Select></Field>
      <Field label="Data da mudança" error={form.error('changedOn')}><Input type="date" value={form.values.changedOn} max={today()} onChange={(event) => form.set('changedOn', event.target.value)} onBlur={() => form.blur('changedOn')} required /></Field>
    </div>
    {statusRequiresMilkingGroup(status) && <GroupPicker label="Lote de ordenha" routines={milkingGroupRoutines} value={form.values.groupId} fieldError={form.error('groupId')} onChange={(value) => form.set('groupId', value)} />}
    {status === 'LACTATING' && <div className="rounded-xl border border-[var(--border)] p-3">
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input className="h-5 w-5" type="checkbox" checked={form.values.registerCalf} onChange={(event) => form.set('registerCalf', event.target.checked)} />Registrar bezerro deste parto</label>
      {form.values.registerCalf && <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Sexo do bezerro"><Select value={form.values.calfSex} onChange={(event) => form.set('calfSex', event.target.value as AnimalSex)}>{Object.entries(animalSexLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
        <Field label="Nome do bezerro" error={form.error('calfName')}><Input value={form.values.calfName} onChange={(event) => form.set('calfName', event.target.value)} onBlur={() => form.blur('calfName')} /></Field>
        <Field label="Brinco do bezerro" hint="Informe o nome ou o brinco."><Input inputMode="numeric" value={form.values.calfTag} onChange={(event) => { form.set('calfTag', event.target.value); form.blur('calfName'); }} /></Field>
        <Field label="Pai (opcional)" hint="A vaca fica registrada como mãe automaticamente."><Select value={form.values.calfSireId} onChange={(event) => form.set('calfSireId', event.target.value)}><option value="">Não informado</option>{sires.map((animal) => <option key={animal.id} value={animal.id}>{animal.name || `Brinco ${animal.tagNumber}`}</option>)}</Select></Field>
      </div>}
    </div>}
    {(status === 'SOLD' || status === 'DEAD') && <div className="notice notice-warning flex gap-2"><AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden /><span>Esta situação retira a vaca dos controles futuros. Confirme data e motivo com atenção.</span></div>}
    {(status === 'SOLD' || status === 'DEAD') && <details className="rounded-xl border border-[var(--border)] p-3" open><summary className="min-h-11 cursor-pointer py-2 font-bold">Detalhes da saída</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{status === 'SOLD' && <Field label="Tipo de saída"><Select value={form.values.exitType} onChange={(event) => form.set('exitType', event.target.value)}><option value="CALF_SALE">Venda de cria</option><option value="BREEDING_SALE">Venda para reprodução</option><option value="PRODUCTIVE_CULL">Descarte produtivo</option><option value="HEALTH_CULL">Descarte por saúde</option><option value="MEAT_SALE">Venda para abate</option><option value="OTHER">Outro</option></Select></Field>}<Field label="Motivo"><Input value={form.values.reason} onChange={(event) => form.set('reason', event.target.value)} placeholder={status === 'DEAD' ? 'Ex.: causa conhecida ou circunstância' : 'Ex.: baixa produção'} /></Field><Field label="Peso (opcional)"><WeightInput value={form.values.weightKg} onValueChange={(value) => form.set('weightKg', value)} /></Field>{status === 'SOLD' && <><Field label="Comprador"><Input value={form.values.buyerName} onChange={(event) => form.set('buyerName', event.target.value)} /></Field><Field label="Valor recebido" error={form.error('amount')}><MoneyInput value={form.values.amount} required={form.values.createRevenue} onValueChange={(value) => form.set('amount', value)} /></Field><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input className="h-5 w-5" type="checkbox" checked={form.values.createRevenue} onChange={(event) => { form.set('createRevenue', event.target.checked); if (event.target.checked) form.set('existingRevenueId', ''); }} />Criar receita de venda de animal</label><Field label="Ou vincular receita existente"><Select value={form.values.existingRevenueId} onChange={(event) => { form.set('existingRevenueId', event.target.value); if (event.target.value) form.set('createRevenue', false); }}><option value="">Nenhuma</option>{revenues?.filter((revenue) => revenue.status !== 'CANCELLED' && (!revenue.animalId || revenue.animalId === animalId)).map((revenue) => <option value={revenue.id} key={revenue.id}>{revenue.description} · {formatMoney(revenue.amount)}</option>)}</Select></Field></>}</div></details>}
    <Field label="Motivo ou observação" hint={status === 'SOLD' || status === 'DEAD' ? 'Obrigatório para preservar o histórico.' : undefined} error={form.error('notes')}><Textarea className="min-h-16" value={form.values.notes} required={status === 'SOLD' || status === 'DEAD'} onChange={(event) => form.set('notes', event.target.value)} onBlur={() => form.blur('notes')} placeholder={status === 'DRY' ? 'Ex.: início do período seco' : status === 'LACTATING' ? 'Ex.: data do parto e início da lactação' : 'Opcional'} /></Field>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || status === currentStatus}>{busy ? 'Registrando…' : status === 'LACTATING' ? 'Registrar parto e iniciar lactação' : 'Registrar mudança'}</Button>{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}</div>
  </form>;
}
