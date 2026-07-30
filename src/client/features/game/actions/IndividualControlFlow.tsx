import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { GUARDRAILS, rangeError } from '../../../../domain/guardrails';
import type { MilkingRoutine } from '../../../../domain/herd';
import { ParsedDecimalInput } from '../../../components/form-controls';
import { useToast } from '../../../components/feedback-context';
import { ErrorState, Field, Input, SkeletonList } from '../../../components/ui';
import { ExistingMilkSessionConflict } from '../../milk/ExistingMilkSessionConflict';
import { findMilkSessionByDate } from '../../milk/findMilkSessionByDate';
import { GroupPicker } from '../../animals/GroupPicker';
import { useResource } from '../../../hooks/useResource';
import { useSubmit } from '../../../hooks/useSubmit';
import { api, ApiError, json } from '../../../lib/api';

type HerdMember = { id: string; name: string | null; tagNumber: string | null; milkingRoutine: MilkingRoutine };
type RowValue = { morning: number | null; afternoon: number | null };

function memberLabel(member: HerdMember) { return member.name || (member.tagNumber ? `Brinco ${member.tagNumber}` : 'Animal sem identificação'); }

/**
 * Controle individual vaca a vaca dentro da folha da mangueira (mesma regra do
 * formulário manual /producao/individual/novo): a fila são as vacas LACTATING
 * em lote de ordenha na data (GET /api/milking-herd) e a gravação vai para o
 * mesmo POST /api/milk-sessions. Uma vaca por vez, campo grande de litros e
 * avanço automático ao concluir os períodos dela.
 */
export function IndividualControlFlow({ today, onSaved }: { today: string; onSaved: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { busy, error, run } = useSubmit();
  const [date, setDate] = useState(today);
  const [herdGroupId, setHerdGroupId] = useState('');
  const { data: herd, loading, error: herdError, reload } = useResource<HerdMember[]>(`/api/milking-herd?date=${date}&herdGroupId=${herdGroupId}`);
  const [values, setValues] = useState<Record<string, RowValue>>({});
  const [rowError, setRowError] = useState('');
  const [index, setIndex] = useState(0);
  const [existingSession, setExistingSession] = useState<{ id: string; sessionDate: string } | null>(null);

  useEffect(() => {
    setValues({});
    setRowError('');
    setIndex(0);
    setExistingSession(null);
  }, [date]);

  const members = herd ?? [];
  const current = members[Math.min(index, Math.max(members.length - 1, 0))] ?? null;
  const filledCount = members.filter((member) => {
    const value = values[member.id];
    return value && value.morning !== null && (member.milkingRoutine === 'MORNING_ONLY' || value.afternoon !== null);
  }).length;
  const allFilled = members.length > 0 && filledCount === members.length;

  function setValue(id: string, period: keyof RowValue, value: number | null) {
    setValues((currentValues) => {
      const previous = currentValues[id] ?? { morning: null, afternoon: null };
      return { ...currentValues, [id]: { ...previous, [period]: value } };
    });
    setRowError('');
  }

  function currentComplete(): boolean {
    if (!current) return false;
    const value = values[current.id] ?? { morning: null, afternoon: null };
    if (value.morning === null || rangeError(value.morning, GUARDRAILS.individualMilkLiters, ' L')) return false;
    if (current.milkingRoutine !== 'MORNING_ONLY' && (value.afternoon === null || rangeError(value.afternoon, GUARDRAILS.individualMilkLiters, ' L'))) return false;
    return true;
  }

  /** Avanço automático: ao concluir os períodos da vaca, a próxima aparece. */
  function advanceIfComplete() {
    if (!currentComplete()) return;
    setIndex((currentIndex) => Math.min(currentIndex + 1, members.length - 1));
  }

  async function persist() {
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
    await run(async () => {
      try {
        await api<{ id: string }>('/api/milk-sessions', json('POST', { sessionDate: date, herdGroupId, inputMode: 'SEPARATE_MORNING_AFTERNOON', measurements }));
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === 'SESSION_DATE_EXISTS') {
          const session = await findMilkSessionByDate(date, herdGroupId);
          if (session) {
            setExistingSession(session);
            return;
          }
        }
        throw cause;
      }
      toast('Controle individual registrado');
      onSaved();
    });
  }

  if (existingSession) {
    return <ExistingMilkSessionConflict
      session={existingSession}
      onOpen={() => navigate(`/producao/${existingSession.id}`)}
      onCancel={() => setExistingSession(null)}
    />;
  }

  return <div className="grid gap-3" data-testid="game-individual-control">
    {error && <ErrorState message={error} />}
    <Field label="Data do controle" hint="A fila é o rebanho em lactação e em lote de ordenha nessa data.">
      <Input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
    </Field>
    <GroupPicker
      label="Lote medido"
      value={herdGroupId}
      routines={['MORNING_AND_AFTERNOON', 'MORNING_ONLY']}
      onChange={(groupId) => {
        setHerdGroupId(groupId);
        setValues({});
        setRowError('');
        setIndex(0);
        setExistingSession(null);
      }}
    />
    {!herdGroupId ? null : loading ? <SkeletonList rows={3} /> : herdError ? <ErrorState message={herdError} retry={reload} /> : !members.length
      ? <p className="game-notebook-empty">Nenhuma vaca em lactação em lote de ordenha nesta data.</p>
      : current && <>
        <p className="game-notebook-heading" data-testid="game-individual-progress">Vaca {index + 1} de {members.length} · {filledCount} preenchidas</p>
        <div className="game-individual-card" key={current.id}>
          <strong className="game-individual-name">{memberLabel(current)}</strong>
          <div className="grid gap-3">
            <Field label="Manhã (L)" error={rowError && values[current.id]?.morning === null ? rowError : undefined}>
              <ParsedDecimalInput
                className="game-individual-input"
                suffix="L"
                value={values[current.id]?.morning ?? null}
                onValueChange={(value) => setValue(current.id, 'morning', value)}
                onBlur={current.milkingRoutine === 'MORNING_ONLY' ? advanceIfComplete : undefined}
                autoFocus
              />
            </Field>
            {current.milkingRoutine !== 'MORNING_ONLY' && <Field label="Tarde (L)">
              <ParsedDecimalInput
                className="game-individual-input"
                suffix="L"
                value={values[current.id]?.afternoon ?? null}
                onValueChange={(value) => setValue(current.id, 'afternoon', value)}
                onBlur={advanceIfComplete}
              />
            </Field>}
            {current.milkingRoutine === 'MORNING_ONLY' && <p className="text-sm text-[var(--muted)]">Lote com ordenha só pela manhã — a tarde fica vazia.</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {index > 0 && <button type="button" className="game-sheet-back" data-testid="game-individual-prev" onClick={() => setIndex(index - 1)}>
              <ArrowLeft size={16} aria-hidden />{memberLabel(members[index - 1])}
            </button>}
            {index < members.length - 1 && <button type="button" className="game-sheet-back" data-testid="game-individual-next" disabled={!currentComplete()} onClick={advanceIfComplete}>
              {memberLabel(members[index + 1])}<ArrowRight size={16} aria-hidden />
            </button>}
          </div>
        </div>
        {rowError && <p className="text-sm text-[var(--danger)]">{rowError}</p>}
        <button
          type="button"
          className="game-cta"
          data-testid="game-individual-save"
          disabled={busy || !allFilled}
          onClick={() => {
            if (!allFilled) {
              setRowError('Preencha a medição de todas as vacas antes de salvar.');
              return;
            }
            void persist();
          }}
        >
          <Check size={18} aria-hidden />{busy ? 'Salvando…' : `Salvar controle (${filledCount}/${members.length})`}
        </button>
      </>}
  </div>;
}
