import { useState } from 'react';
import { parseDecimal } from '../../../domain/format';
import { LitersInput } from '../../components/form-controls';
import { Button, Field, Select, Textarea } from '../../components/ui';
import { milkMeasurementStatusDescriptor } from '../../lib/status';

export type MeasurementEditValue = {
  animalId: string | null;
  morningLiters: number | null;
  afternoonLiters: number | null;
  totalLiters: number | null;
  confidence: string;
  status: string;
  notes: string | null;
};

type EditableMeasurement = {
  animalId: string | null;
  morningLiters: string | null;
  afternoonLiters: string | null;
  totalLiters: string | null;
  confidence: string;
  status: string;
  notes: string | null;
};

type AnimalOption = { id: string; name: string | null; tagNumber: string | null };

export function MilkMeasurementEditor({ measurement, animals, busy, onSave, onCancel }: {
  measurement: EditableMeasurement;
  animals: AnimalOption[];
  busy: boolean;
  onSave: (value: MeasurementEditValue) => void;
  onCancel: () => void;
}) {
  const [animalId, setAnimalId] = useState(measurement.animalId ?? '');
  const [mode, setMode] = useState(measurement.morningLiters !== null || measurement.afternoonLiters !== null ? 'SEPARATE' : 'COMBINED');
  const [morning, setMorning] = useState(measurement.morningLiters ?? '');
  const [afternoon, setAfternoon] = useState(measurement.afternoonLiters ?? '');
  const [total, setTotal] = useState(measurement.totalLiters);
  const [confidence, setConfidence] = useState(measurement.confidence);
  const [status, setStatus] = useState(measurement.status);
  const [notes, setNotes] = useState(measurement.notes ?? '');
  const [validationError, setValidationError] = useState('');

  function submit() {
    const morningValue = mode === 'SEPARATE' ? parseDecimal(morning) : null;
    const afternoonValue = mode === 'SEPARATE' ? parseDecimal(afternoon) : null;
    const totalValue = mode === 'SEPARATE'
      ? (morningValue === null && afternoonValue === null ? null : (morningValue ?? 0) + (afternoonValue ?? 0))
      : parseDecimal(total);
    if (status !== 'EXCLUDED' && (totalValue === null || totalValue < 0)) {
      setValidationError(mode === 'SEPARATE' ? 'Informe ao menos uma medição para recalcular o total.' : 'Informe um total válido.');
      return;
    }
    setValidationError('');
    onSave({
      animalId: animalId || null,
      morningLiters: morningValue,
      afternoonLiters: afternoonValue,
      totalLiters: totalValue,
      confidence,
      status,
      notes: notes.trim() || null,
    });
  }

  const calculatedTotal = mode === 'SEPARATE' && (parseDecimal(morning) !== null || parseDecimal(afternoon) !== null)
    ? (parseDecimal(morning) ?? 0) + (parseDecimal(afternoon) ?? 0)
    : null;

  return <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Animal vinculado"><Select value={animalId} onChange={(event) => setAnimalId(event.target.value)}><option value="">Sem vínculo</option>{animals.map((animal) => <option key={animal.id} value={animal.id}>{animal.name || `Brinco ${animal.tagNumber}`}</option>)}</Select></Field>
      <Field label="Forma da medição"><Select value={mode} onChange={(event) => setMode(event.target.value)}><option value="COMBINED">Somente total observado</option><option value="SEPARATE">Manhã e tarde medidas</option></Select></Field>
      {mode === 'COMBINED' ? <Field label="Total observado (L)" error={validationError}><LitersInput value={total} onValueChange={(value) => { setTotal(value); setValidationError(''); }} /></Field> : <>
        <Field label="Manhã (L)" error={validationError}><LitersInput value={morning} onValueChange={(value) => { setMorning(value); setValidationError(''); }} /></Field>
        <Field label="Tarde (L)"><LitersInput value={afternoon} onValueChange={(value) => { setAfternoon(value); setValidationError(''); }} /></Field>
        <div className="field"><span className="field-label">Total recalculado</span><div className="input flex items-center font-bold">{calculatedTotal === null ? '—' : `${calculatedTotal.toLocaleString('pt-BR')} L`}</div></div>
      </>}
      <Field label="Confiança"><Select value={confidence} onChange={(event) => setConfidence(event.target.value)}><option value="HIGH">Alta</option><option value="MEDIUM">Média</option><option value="LOW">Baixa</option></Select></Field>
      <Field label="Situação"><Select value={status} onChange={(event) => setStatus(event.target.value)}>{Object.entries(milkMeasurementStatusDescriptor).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
      <Field label="Observação"><Textarea className="min-h-12" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} onClick={submit}>{busy ? 'Salvando…' : 'Salvar correção'}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button></div>
  </div>;
}
