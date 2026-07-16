import { FormEvent, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { allowedNextStatuses, statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select, Textarea } from '../../components/ui';
import { api, json } from '../../lib/api';
import { animalStatusLabels, today } from '../../lib/labels';
import { useResource } from '../../hooks/useResource';
import { formatMoney, parseDecimal } from '../../../domain/format';
import { MoneyInput, WeightInput } from '../../components/form-controls';
import { GroupPicker } from './GroupPicker';
import { useToast } from '../../components/feedback-context';

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
  const [status, setStatus] = useState<AnimalStatus>(initialStatus && choices.includes(initialStatus) ? initialStatus : suggested);
  const [changedOn, setChangedOn] = useState(today());
  const [notes, setNotes] = useState('');
  const [groupId, setGroupId] = useState('');
  const [exitType, setExitType] = useState('OTHER');
  const [reason, setReason] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [amount, setAmount] = useState('');
  const [createRevenue, setCreateRevenue] = useState(false);
  const [existingRevenueId, setExistingRevenueId] = useState('');
  const { data: revenues } = useResource<Array<{ id: string; description: string; amount: string; status: string; animalId: string | null }>>('/api/revenues');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ date?: string; group?: string; notes?: string; amount?: string }>({});
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const parsedAmount = parseDecimal(amount);
    const nextErrors = {
      date: changedOn ? undefined : 'Informe a data da mudança.',
      group: statusRequiresMilkingGroup(status) && !groupId ? 'Selecione o lote de ordenha.' : undefined,
      notes: (status === 'SOLD' || status === 'DEAD') && !notes.trim() ? 'Informe o motivo ou uma observação para o histórico.' : undefined,
      amount: status === 'SOLD' && createRevenue && (parsedAmount === null || parsedAmount <= 0) ? 'Informe um valor recebido maior que zero.' : undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.date || nextErrors.group || nextErrors.notes || nextErrors.amount) return;
    setBusy(true);
    try {
      const exit = status === 'SOLD' ? {
        exitType, reason: reason.trim() || notes.trim() || null, buyerName: buyerName.trim() || null,
        weightKg: parseDecimal(weightKg), amount: parseDecimal(amount), createRevenue, existingRevenueId: existingRevenueId || null, notes: notes.trim() || null,
      } : status === 'DEAD' ? { reason: reason.trim() || notes.trim() || null, weightKg: parseDecimal(weightKg), notes: notes.trim() || null } : null;
      await api(`/api/animals/${animalId}/status-changes`, json('POST', { status, changedOn, notes: notes.trim() || null, groupId: statusRequiresMilkingGroup(status) ? groupId : null, exit }));
      toast('Situação do animal atualizada');
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a situação.'); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-3" noValidate onSubmit={submit}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={Object.values(fieldErrors)} />
    <div className="notice notice-info flex gap-2"><RefreshCw className="mt-0.5 shrink-0" size={17} aria-hidden /><span>A mudança fica registrada no histórico. Ao sair de lactação, o lote de ordenha é encerrado.</span></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nova situação"><Select value={status} onChange={(event) => setStatus(event.target.value as AnimalStatus)}>{choices.map((value) => <option key={value} value={value}>{animalStatusLabels[value]}</option>)}</Select></Field>
      <Field label="Data da mudança" error={fieldErrors.date}><Input type="date" value={changedOn} max={today()} onChange={(event) => { setChangedOn(event.target.value); setFieldErrors((current) => ({ ...current, date: undefined })); }} required /></Field>
    </div>
    {statusRequiresMilkingGroup(status) && <GroupPicker label="Lote de ordenha" value={groupId} fieldError={fieldErrors.group} onChange={(value) => { setGroupId(value); setFieldErrors((current) => ({ ...current, group: undefined })); }} />}
    {(status === 'SOLD' || status === 'DEAD') && <div className="notice notice-warning flex gap-2"><AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden /><span>Esta situação retira a vaca dos controles futuros. Confirme data e motivo com atenção.</span></div>}
    {(status === 'SOLD' || status === 'DEAD') && <details className="rounded-xl border border-[var(--border)] p-3" open><summary className="min-h-11 cursor-pointer py-2 font-bold">Detalhes da saída</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{status === 'SOLD' && <Field label="Tipo de saída"><Select value={exitType} onChange={(event) => setExitType(event.target.value)}><option value="CALF_SALE">Venda de cria</option><option value="BREEDING_SALE">Venda para reprodução</option><option value="PRODUCTIVE_CULL">Descarte produtivo</option><option value="HEALTH_CULL">Descarte por saúde</option><option value="MEAT_SALE">Venda para abate</option><option value="OTHER">Outro</option></Select></Field>}<Field label="Motivo"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={status === 'DEAD' ? 'Ex.: causa conhecida ou circunstância' : 'Ex.: baixa produção'} /></Field><Field label="Peso (opcional)"><WeightInput value={weightKg} onValueChange={setWeightKg} /></Field>{status === 'SOLD' && <><Field label="Comprador"><Input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} /></Field><Field label="Valor recebido" error={fieldErrors.amount}><MoneyInput value={amount} required={createRevenue} onValueChange={(value) => { setAmount(value); setFieldErrors((current) => ({ ...current, amount: undefined })); }} /></Field><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input className="h-5 w-5" type="checkbox" checked={createRevenue} onChange={(event) => { setCreateRevenue(event.target.checked); setFieldErrors((current) => ({ ...current, amount: undefined })); if (event.target.checked) setExistingRevenueId(''); }} />Criar receita de venda de animal</label><Field label="Ou vincular receita existente"><Select value={existingRevenueId} onChange={(event) => { setExistingRevenueId(event.target.value); if (event.target.value) setCreateRevenue(false); }}><option value="">Nenhuma</option>{revenues?.filter((revenue) => revenue.status !== 'CANCELLED' && (!revenue.animalId || revenue.animalId === animalId)).map((revenue) => <option value={revenue.id} key={revenue.id}>{revenue.description} · {formatMoney(revenue.amount)}</option>)}</Select></Field></>}</div></details>}
    <Field label="Motivo ou observação" hint={status === 'SOLD' || status === 'DEAD' ? 'Obrigatório para preservar o histórico.' : undefined} error={fieldErrors.notes}><Textarea className="min-h-16" value={notes} required={status === 'SOLD' || status === 'DEAD'} onChange={(event) => { setNotes(event.target.value); setFieldErrors((current) => ({ ...current, notes: undefined })); }} placeholder={status === 'DRY' ? 'Ex.: início do período seco' : status === 'LACTATING' ? 'Ex.: data do parto e início da lactação' : 'Opcional'} /></Field>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || status === currentStatus}>{busy ? 'Registrando…' : status === 'LACTATING' ? 'Registrar parto e iniciar lactação' : 'Registrar mudança'}</Button>{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}</div>
  </form>;
}
