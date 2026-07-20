import { formatLiters, parseDecimal } from '../../../domain/format';
import { GUARDRAILS, rangeError } from '../../../domain/guardrails';
import { LitersInput } from '../../components/form-controls';
import { ErrorState, Field, FormErrorSummary, Input, Select, SubmitBar, Textarea } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import type { HerdGroup } from '../animals/GroupPicker';

export type DailyMilkTotal = {
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

/**
 * Formulário do total diário (rebanho todo ou lote). Sem chave/IA: entrada
 * direta. Um período pode chegar sozinho (manhã agora, tarde depois); exigimos
 * apenas um dos dois. GUARDRAILS barra o claramente impossível por período.
 */
export function DailyMilkTotalForm({ initial, onSaved }: {
  initial?: DailyMilkTotal;
  onSaved: (total: DailyMilkTotal) => void;
}) {
  const { busy, error, run } = useSubmit();
  const { data: groups = [] } = useResource<HerdGroup[]>('/api/herd-groups');
  const form = useForm(
    {
      productionDate: initial?.productionDate ?? today(),
      herdGroupId: initial?.herdGroupId ?? '',
      morningLiters: initial?.morningLiters ?? '',
      afternoonLiters: initial?.afternoonLiters ?? '',
      notes: initial?.notes ?? '',
    },
    {
      productionDate: (value) => (value ? undefined : 'Informe a data da produção.'),
      morningLiters: (value, all) => {
        const morning = parseDecimal(value);
        const afternoon = parseDecimal(all.afternoonLiters);
        if (morning === null && afternoon === null) return 'Informe a produção da manhã ou da tarde.';
        if (value.trim() && morning === null) return 'Informe um volume válido para a manhã.';
        return morning === null ? undefined : rangeError(morning, GUARDRAILS.dailyMilkLiters, ' L');
      },
      afternoonLiters: (value) => {
        const afternoon = parseDecimal(value);
        if (value.trim() && afternoon === null) return 'Informe um volume válido para a tarde.';
        return afternoon === null ? undefined : rangeError(afternoon, GUARDRAILS.dailyMilkLiters, ' L');
      },
    },
  );
  useUnsavedGuard(form.dirty);

  const selectedGroup = groups?.find((group) => group.id === form.values.herdGroupId) ?? null;
  const morningOnly = selectedGroup?.milkingRoutine === 'MORNING_ONLY';
  const parsedMorning = parseDecimal(form.values.morningLiters);
  const parsedAfternoon = morningOnly ? null : parseDecimal(form.values.afternoonLiters);
  const previewTotal = parsedMorning !== null || parsedAfternoon !== null ? (parsedMorning ?? 0) + (parsedAfternoon ?? 0) : null;

  async function persist() {
    const { productionDate, herdGroupId, notes } = form.values;
    const path = initial ? `/api/daily-milk-totals/${initial.id}` : '/api/daily-milk-totals';
    const saved = await api<DailyMilkTotal>(path, json(initial ? 'PATCH' : 'POST', {
      productionDate,
      herdGroupId: herdGroupId || null,
      morningLiters: parsedMorning,
      afternoonLiters: morningOnly ? null : parsedAfternoon,
      notes: notes.trim() || null,
    }));
    onSaved(saved);
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Data" error={form.error('productionDate')}><Input type="date" value={form.values.productionDate} max={today()} onChange={(event) => form.set('productionDate', event.target.value)} onBlur={() => form.blur('productionDate')} required /></Field>
      <Field label="Produção de" hint={form.values.herdGroupId ? 'Use lote apenas quando o volume foi medido separadamente.' : 'Total geral da propriedade.'}>
        <Select value={form.values.herdGroupId} onChange={(event) => { form.set('herdGroupId', event.target.value); const group = groups?.find((item) => item.id === event.target.value); if (group?.milkingRoutine === 'MORNING_ONLY') form.set('afternoonLiters', ''); }}>
          <option value="">Rebanho todo</option>
          {groups?.filter((group) => (group.active && group.milkingRoutine !== 'NOT_MILKED') || group.id === form.values.herdGroupId).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </Select>
      </Field>
      <Field label="Manhã (L)" hint="Deixe em branco se ainda não ordenhou de manhã." error={form.error('morningLiters')}><LitersInput placeholder="Ex.: 210,5" value={form.values.morningLiters} onValueChange={(value) => form.set('morningLiters', value)} onBlur={() => form.blur('morningLiters')} autoFocus /></Field>
      <Field label="Tarde (L)" hint={morningOnly ? 'Este lote possui ordenha somente pela manhã.' : 'Pode ser preenchida depois.'} error={form.error('afternoonLiters')}><LitersInput placeholder={morningOnly ? 'Sem ordenha à tarde' : 'Ex.: 175'} value={morningOnly ? '' : form.values.afternoonLiters} onValueChange={(value) => form.set('afternoonLiters', value)} onBlur={() => form.blur('afternoonLiters')} disabled={morningOnly} /></Field>
    </div>
    <Field label="Observação (opcional)"><Textarea className="min-h-12" placeholder="Ex.: medição separada no tanque do lote" value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field>
    {previewTotal !== null && <p className="text-sm text-[var(--muted)]">Total calculado: <strong className="text-[var(--text)]">{formatLiters(previewTotal)}</strong></p>}
    <SubmitBar label={initial ? 'Salvar alteração' : 'Registrar total'} busy={busy} />
  </form>;
}
