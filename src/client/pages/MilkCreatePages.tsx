import { useState } from 'react';
import { ClipboardList, Milk } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { GUARDRAILS, rangeError } from '../../domain/guardrails';
import type { MilkingRoutine } from '../../domain/herd';
import { ParsedDecimalInput } from '../components/form-controls';
import { useToast } from '../components/feedback-context';
import { Button, EmptyState, ErrorState, Field, FormErrorSummary, Input, PageHeader, ScrollArea, SectionCard, SkeletonList, SubmitBar } from '../components/ui';
import { DailyMilkTotalForm } from '../features/milk/DailyMilkTotalForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { api, json } from '../lib/api';
import { today } from '../lib/labels';

export function NewDailyMilkTotalPage() {
  const navigate = useNavigate();
  const toast = useToast();
  return <div className="page"><div className="page-narrow">
    <PageHeader icon={Milk} title="Total do dia" subtitle="Produção agregada do rebanho todo ou de um lote medido à parte" />
    <SectionCard>
      <p className="mb-4 text-sm text-[var(--muted)]">O sistema não distribui esse total entre as vacas e mantém o controle individual como outro fato. Um período pode ser registrado agora e o outro mais tarde.</p>
      <DailyMilkTotalForm onSaved={() => { toast('Produção registrada'); navigate('/producao', { replace: true }); }} />
    </SectionCard>
  </div></div>;
}

type HerdMember = { id: string; name: string | null; tagNumber: string | null; milkingRoutine: MilkingRoutine };
type RowValue = { morning: number | null; afternoon: number | null };
type RowError = { morning?: string; afternoon?: string };

function memberLabel(member: HerdMember) { return member.name || (member.tagNumber ? `Brinco ${member.tagNumber}` : 'Animal sem identificação'); }

export function NewIndividualControlPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const [date, setDate] = useState(today());
  const { data: herd, loading, error: herdError, reload } = useResource<HerdMember[]>(`/api/milking-herd?date=${date}`);
  const [values, setValues] = useState<Record<string, RowValue>>({});
  const [errors, setErrors] = useState<Record<string, RowError>>({});
  const dirty = Object.keys(values).length > 0;
  useUnsavedGuard(dirty);

  function setValue(id: string, period: keyof RowValue, value: number | null) {
    setValues((current) => {
      const previous = current[id] ?? { morning: null, afternoon: null };
      return { ...current, [id]: { ...previous, [period]: value } };
    });
    setErrors((current) => (current[id]?.[period] ? { ...current, [id]: { ...current[id], [period]: undefined } } : current));
  }

  function validate(members: HerdMember[]): boolean {
    const next: Record<string, RowError> = {};
    let ok = true;
    for (const member of members) {
      const value = values[member.id] ?? { morning: null, afternoon: null };
      const rowError: RowError = {};
      if (value.morning === null) rowError.morning = 'Informe a manhã.';
      else rowError.morning = rangeError(value.morning, GUARDRAILS.individualMilkLiters, ' L');
      if (member.milkingRoutine === 'MORNING_AND_AFTERNOON') {
        if (value.afternoon === null) rowError.afternoon = 'Informe a tarde.';
        else rowError.afternoon = rangeError(value.afternoon, GUARDRAILS.individualMilkLiters, ' L');
      }
      if (rowError.morning || rowError.afternoon) { next[member.id] = rowError; ok = false; }
    }
    setErrors(next);
    return ok;
  }

  async function persist(members: HerdMember[]) {
    const measurements = members.map((member) => {
      const value = values[member.id] ?? { morning: null, afternoon: null };
      const afternoon = member.milkingRoutine === 'MORNING_ONLY' ? null : value.afternoon;
      return {
        animalId: member.id,
        rawAnimalLabel: memberLabel(member),
        morningLiters: value.morning,
        afternoonLiters: afternoon,
        totalLiters: (value.morning ?? 0) + (afternoon ?? 0),
        status: 'CONFIRMED' as const,
      };
    });
    const created = await api<{ id: string }>('/api/milk-sessions', json('POST', { sessionDate: date, inputMode: 'SEPARATE_MORNING_AFTERNOON', measurements }));
    toast('Controle individual registrado');
    navigate(`/producao/${created.id}`, { replace: true });
  }

  const errorCount = Object.values(errors).reduce((sum, row) => sum + (row.morning ? 1 : 0) + (row.afternoon ? 1 : 0), 0);
  const filled = herd?.filter((member) => (values[member.id]?.morning ?? null) !== null).length ?? 0;

  return <div className="page"><div className="page-narrow">
    <PageHeader icon={ClipboardList} title="Controle individual" subtitle="Medição vaca a vaca das que estavam em lactação e em lote de ordenha na data" />
    <div className="grid gap-5">
      {error && <ErrorState message={error} />}
      <SectionCard>
        <Field label="Data do controle" hint="A lista abaixo é o rebanho em lactação e em ordenha nessa data.">
          <Input type="date" value={date} max={today()} onChange={(event) => { setDate(event.target.value); setValues({}); setErrors({}); }} />
        </Field>
      </SectionCard>
      {loading ? <SkeletonList rows={5} /> : herdError ? <ErrorState message={herdError} retry={reload} /> : !herd?.length
        ? <EmptyState title="Nenhuma vaca em lactação em lote de ordenha nesta data" description="Cadastre animais em lactação e em um lote de ordenha, ou importe uma transcrição pelo Assistente." action={<Link className="button button-secondary" to="/rebanho">Abrir rebanho</Link>} />
        : <form noValidate onSubmit={(event) => { event.preventDefault(); if (validate(herd)) void run(() => persist(herd)); }}>
          <SectionCard title={`Vacas em lactação · ${herd.length}`} action={<span className="text-xs text-[var(--muted)]">{filled}/{herd.length} preenchidas</span>}>
            <FormErrorSummary errors={errorCount ? Array.from({ length: errorCount }, () => 'erro') : []} />
            <ScrollArea label="Vacas do controle individual" className="max-h-[46rem]">
              {herd.map((member) => {
                const morningOnly = member.milkingRoutine === 'MORNING_ONLY';
                return <div className="border-b border-[var(--border)] py-3 last:border-b-0" key={member.id}>
                  <strong className="block">{memberLabel(member)}</strong>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Field label="Manhã (L)" error={errors[member.id]?.morning}><ParsedDecimalInput suffix="L" value={values[member.id]?.morning ?? null} onValueChange={(value) => setValue(member.id, 'morning', value)} /></Field>
                    <Field label="Tarde (L)" hint={morningOnly ? 'Lote sem ordenha à tarde.' : undefined} error={errors[member.id]?.afternoon}><ParsedDecimalInput suffix="L" value={morningOnly ? null : values[member.id]?.afternoon ?? null} onValueChange={(value) => setValue(member.id, 'afternoon', value)} disabled={morningOnly} /></Field>
                  </div>
                </div>;
              })}
            </ScrollArea>
          </SectionCard>
          <div className="mt-4"><SubmitBar label="Salvar controle" busy={busy} secondary={<Button type="button" variant="secondary" onClick={() => navigate('/producao')}>Cancelar</Button>} /></div>
        </form>}
    </div>
  </div></div>;
}
