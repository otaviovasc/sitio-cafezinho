import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { GUARDRAILS, rangeError } from '../../../../domain/guardrails';
import { ParsedDecimalInput } from '../../../components/form-controls';
import { useToast } from '../../../components/feedback-context';
import { ErrorState, Field, Input, SkeletonList } from '../../../components/ui';
import { useResource } from '../../../hooks/useResource';
import { useSubmit } from '../../../hooks/useSubmit';
import { api, json } from '../../../lib/api';

type Animal = { id: string; name: string | null; tagNumber: string | null; status: string };

function animalLabel(animal: Animal) { return animal.name || (animal.tagNumber ? `Brinco ${animal.tagNumber}` : 'Animal sem identificação'); }

/**
 * Pesagem vaca a vaca dentro da folha da balança (mesmo padrão do controle
 * individual da mangueira): a fila são TODOS os animais vivos, um por vez,
 * campo grande de kg e avanço automático. A sessão pode ser PARCIAL — só os
 * animais realmente pesados entram na gravação (regra de domínio: peso é
 * medição pontual, nunca interpolada). Grava no POST /api/weight-sessions
 * existente; a correção linha a linha fica na página de detalhe do app.
 */
export function WeighingQueueFlow({ today, onSaved }: { today: string; onSaved: () => void }) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const [date, setDate] = useState(today);
  const { data: animals, loading, error: animalsError, reload } = useResource<Animal[]>('/api/animals');
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [rowError, setRowError] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setValues({});
    setRowError('');
    setIndex(0);
  }, [date]);

  const members = (animals ?? []).filter((animal) => !['SOLD', 'DEAD'].includes(animal.status));
  const current = members[Math.min(index, Math.max(members.length - 1, 0))] ?? null;
  const weighed = members.filter((member) => {
    const value = values[member.id];
    return value !== null && value !== undefined && !rangeError(value, GUARDRAILS.weightKg, ' kg');
  });

  function setValue(id: string, value: number | null) {
    setValues((currentValues) => ({ ...currentValues, [id]: value }));
    setRowError('');
  }

  function currentValid(): boolean {
    if (!current) return false;
    const value = values[current.id];
    return value !== null && value !== undefined && !rangeError(value, GUARDRAILS.weightKg, ' kg');
  }

  /** Avanço automático: peso válido gravado no campo, a próxima vaca aparece. */
  function advanceIfValid() {
    if (!currentValid()) return;
    setIndex((currentIndex) => Math.min(currentIndex + 1, members.length - 1));
  }

  async function persist() {
    await run(async () => {
      await api<{ id: string }>('/api/weight-sessions', json('POST', {
        measuredOn: date,
        title: 'Pesagem do rebanho',
        measurements: weighed.map((animal) => ({
          animalId: animal.id,
          rawAnimalLabel: animalLabel(animal),
          weightKg: values[animal.id],
          confidence: 'HIGH',
          status: 'CONFIRMED',
          notes: null,
        })),
      }));
      toast(`Pesagem registrada (${weighed.length} ${weighed.length === 1 ? 'animal' : 'animais'})`);
      onSaved();
    });
  }

  return <div className="grid gap-3" data-testid="game-weighing-queue">
    {error && <ErrorState message={error} />}
    <Field label="Data da pesagem" hint="A fila é o rebanho vivo inteiro; pule quem não foi pesado.">
      <Input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
    </Field>
    {loading ? <SkeletonList rows={3} /> : animalsError ? <ErrorState message={animalsError} retry={reload} /> : !members.length
      ? <p className="game-notebook-empty">Nenhum animal vivo no rebanho.</p>
      : current && <>
        <p className="game-notebook-heading" data-testid="game-weighing-progress">Animal {index + 1} de {members.length} · {weighed.length} pesados</p>
        <div className="game-individual-card" key={current.id}>
          <strong className="game-individual-name">{animalLabel(current)}</strong>
          <Field label="Peso (kg)" error={rowError && !currentValid() ? rowError : undefined}>
            <ParsedDecimalInput
              className="game-individual-input"
              suffix="kg"
              value={values[current.id] ?? null}
              onValueChange={(value) => setValue(current.id, value)}
              onBlur={advanceIfValid}
              autoFocus
            />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            {index > 0 && <button type="button" className="game-sheet-back" data-testid="game-weighing-prev" onClick={() => setIndex(index - 1)}>
              <ArrowLeft size={16} aria-hidden />{animalLabel(members[index - 1])}
            </button>}
            {index < members.length - 1 && <button type="button" className="game-sheet-back" data-testid="game-weighing-next" onClick={advanceIfValid}>
              {animalLabel(members[index + 1])}<ArrowRight size={16} aria-hidden />
            </button>}
          </div>
        </div>
        {rowError && <p className="text-sm text-[var(--danger)]">{rowError}</p>}
        <button
          type="button"
          className="game-cta"
          data-testid="game-weighing-save"
          disabled={busy || !weighed.length}
          onClick={() => {
            if (!weighed.length) {
              setRowError('Informe o peso de ao menos um animal pesado.');
              return;
            }
            void persist();
          }}
        >
          <Check size={18} aria-hidden />{busy ? 'Salvando…' : `Salvar pesagem (${weighed.length})`}
        </button>
      </>}
  </div>;
}
