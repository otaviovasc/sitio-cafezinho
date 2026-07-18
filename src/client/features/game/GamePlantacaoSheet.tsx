import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Sprout, Wheat } from 'lucide-react';
import { feedLinesError } from '../../../domain/feeding';
import { formatRemaining, growthProgress, growthStage } from '../../../domain/game/planting';
import type { GamePlanting, GamePlantingInput } from '../../../domain/game/state';
import { GUARDRAILS, rangeError } from '../../../domain/guardrails';
import { ConfirmButton } from '../../components/feedback';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select, SubmitBar, Textarea } from '../../components/ui';
import { FeedLinesEditor } from '../feeding/FeedLinesEditor';
import { emptyFeedLine, parsedLineQuantity, type FeedLineDraft } from '../feeding/lines';
import type { FeedInventoryRow } from '../feeding/types';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { api, ApiError, json } from '../../lib/api';
import { GameSheet } from './GameSheet';
import { PlantacaoSprite } from './sprites/PlantacaoSprite';

/** Resposta completa de um ciclo (POST /api/plantings/:id/harvest). */
export type HarvestedPlanting = GamePlanting & { harvestQuantity: number | null; harvestUnit: string | null };

type DurationUnit = 'minutos' | 'horas' | 'dias';

const DURATION_TO_HOURS: Record<DurationUnit, number> = { minutos: 1 / 60, horas: 1, dias: 24 };

function InputsList({ inputs, title }: { inputs: GamePlantingInput[]; title: string }) {
  return <div className="grid gap-1" data-testid="planting-inputs">
    <small className="text-xs font-bold uppercase tracking-wide text-[#6b6e60]">{title}</small>
    <ul className="grid gap-1 text-sm">
      {inputs.map((input, index) => <li key={index} className="flex items-center justify-between gap-2">
        <span>{input.name}</span>
        <span className="font-extrabold tabular-nums">{input.quantity} {input.unit}</span>
      </li>)}
    </ul>
  </div>;
}

/**
 * Formulário de plantio: cultura, duração do ciclo e insumos DO DEPÓSITO
 * (mesmo editor de linhas do trato, com saldo por item). Sem estoque, a folha
 * aponta para a Loja. Uso além do saldo pede confirmação (BEYOND_BALANCE).
 */
function PlantForm({ onPlanted, onOpenLoja }: {
  onPlanted: (planting: GamePlanting) => void;
  onOpenLoja: () => void;
}) {
  const { busy, error, run, setError } = useSubmit();
  const { data: inventory } = useResource<FeedInventoryRow[]>('/api/feed-inventory');
  const [cropName, setCropName] = useState('');
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('dias');
  const [lines, setLines] = useState<FeedLineDraft[]>([emptyFeedLine()]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [beyondBalance, setBeyondBalance] = useState(false);

  const activeItems = (inventory ?? []).filter((row) => row.active);

  function validate(): { feedItemId: string; quantity: number }[] | null {
    if (!cropName.trim()) { setFormError('Informe o que vai plantar (ex.: milho).'); return null; }
    const duration = Number(durationValue.replace(',', '.'));
    if (!Number.isFinite(duration) || duration <= 0) { setFormError('Informe a duração do ciclo.'); return null; }
    const parsed = lines.map((line) => ({ feedItemId: line.feedItemId, quantity: parsedLineQuantity(line) }));
    const linesIssue = feedLinesError(parsed);
    if (linesIssue) { setFormError(linesIssue); return null; }
    for (const line of parsed) {
      const issue = rangeError(line.quantity!, GUARDRAILS.feedQuantity);
      if (issue) { setFormError(issue); return null; }
    }
    setFormError('');
    return parsed.map((line) => ({ feedItemId: line.feedItemId, quantity: line.quantity! }));
  }

  async function persist(confirm: boolean) {
    const inputs = validate();
    if (!inputs) return;
    setBeyondBalance(false);
    const duration = Number(durationValue.replace(',', '.'));
    try {
      const planted = await api<GamePlanting>('/api/plantings', json('POST', {
        cropName: cropName.trim(),
        durationHours: duration * DURATION_TO_HOURS[durationUnit],
        inputs,
        notes: notes.trim() || null,
        confirmBeyondBalance: confirm,
      }));
      onPlanted(planted);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'BEYOND_BALANCE') setBeyondBalance(true);
      throw cause;
    }
  }

  if (inventory && !activeItems.length) {
    return <div className="grid gap-3" data-testid="planting-no-stock">
      <p className="text-sm leading-5">O plantio usa insumos do <strong>Depósito</strong> — e o estoque está vazio. Compre sementes e fertilizante na Loja para começar.</p>
      <Button onClick={onOpenLoja}><ShoppingBag size={16} aria-hidden /> Abrir a Loja</Button>
    </div>;
  }

  return <form className="grid gap-4" noValidate data-testid="planting-form" onSubmit={(event) => { event.preventDefault(); if (validate()) void run(() => persist(false)); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={formError ? [formError] : []} />
    <Field label="O que vai plantar?">
      <Input value={cropName} onChange={(event) => setCropName(event.target.value)} placeholder="Milho, capim, mandioca…" required />
    </Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Duração do ciclo">
        <Input type="number" inputMode="decimal" min="0" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} placeholder="90" required />
      </Field>
      <Field label="Unidade">
        <Select value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}>
          <option value="minutos">minutos</option>
          <option value="horas">horas</option>
          <option value="dias">dias</option>
        </Select>
      </Field>
    </div>
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <small className="text-xs font-bold uppercase tracking-wide text-[#6b6e60]">Insumos do depósito</small>
        <button type="button" className="game-sheet-back !mb-0" onClick={onOpenLoja}><ShoppingBag size={14} aria-hidden />Faltou algo? Loja</button>
      </div>
      <FeedLinesEditor lines={lines} inventory={inventory ?? []} onChange={(next) => { setLines(next); setBeyondBalance(false); }} />
    </div>
    <Field label="Observação (opcional)"><Textarea className="min-h-12" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
    <SubmitBar
      label="Plantar"
      busy={busy}
      secondary={beyondBalance && <Button variant="secondary" type="button" disabled={busy} data-testid="planting-confirm-beyond" onClick={() => { setError(''); void run(() => persist(true)); }}>O estoque está incompleto — plantar mesmo assim</Button>}
    />
  </form>;
}

/** Plantio crescendo: barra de progresso derivada do relógio + insumos gastos. */
function GrowingView({ planting, progress, onCancelled }: {
  planting: GamePlanting;
  progress: number;
  onCancelled: (planting: GamePlanting) => void;
}) {
  const { busy, error, run } = useSubmit();
  const remainingMs = new Date(planting.readyAt).getTime() - Date.now();
  return <div className="grid gap-4" data-testid="planting-growing">
    {error && <ErrorState message={error} />}
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-lg">{planting.cropName}</strong>
        <span className="text-sm font-extrabold tabular-nums">{Math.floor(progress * 100)}%</span>
      </div>
      <div className="game-progress" role="progressbar" aria-valuenow={Math.floor(progress * 100)} aria-valuemin={0} aria-valuemax={100} data-testid="planting-progress">
        <div className="game-progress-fill" style={{ width: `${Math.max(2, progress * 100)}%` }} />
      </div>
      <small className="text-sm text-[#6b6e60]">Falta {formatRemaining(remainingMs)} para a colheita.</small>
    </div>
    <InputsList inputs={planting.inputs} title="Insumos investidos" />
    <ConfirmButton variant="danger" question={`O plantio de “${planting.cropName}” será cancelado (os insumos gastos não voltam).`} onClick={() => void run(async () => {
      onCancelled(await api<GamePlanting>(`/api/plantings/${planting.id}/cancel`, json('POST')));
    })} disabled={busy}>Cancelar plantio</ConfirmButton>
  </div>;
}

/** Pronto: registrar o que saiu do talhão. */
function HarvestForm({ planting, onHarvested }: {
  planting: GamePlanting;
  onHarvested: (result: HarvestedPlanting) => void;
}) {
  const { busy, error, run } = useSubmit();
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [formError, setFormError] = useState('');
  return <form className="grid gap-4" noValidate data-testid="planting-harvest-form" onSubmit={(event) => {
    event.preventDefault();
    const parsed = Number(quantity.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) { setFormError('Informe quanto foi colhido.'); return; }
    setFormError('');
    void run(async () => {
      onHarvested(await api<HarvestedPlanting>(`/api/plantings/${planting.id}/harvest`, json('POST', { quantity: parsed, unit })));
    });
  }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={formError ? [formError] : []} />
    <p className="text-sm leading-5"><strong>{planting.cropName}</strong> completou o ciclo — o talhão está pronto para a colheita. 🌾</p>
    <InputsList inputs={planting.inputs} title="Insumos investidos" />
    <div className="grid grid-cols-2 gap-3">
      <Field label="Quanto foi colhido?">
        <Input type="number" inputMode="decimal" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
      </Field>
      <Field label="Unidade">
        <Select value={unit} onChange={(event) => setUnit(event.target.value)}>
          {['kg', 'saco', 'ton', 'L', 'un'].map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </Field>
    </div>
    <SubmitBar label="Registrar colheita" busy={busy} />
  </form>;
}

/** O "recibo" da colheita: o que foi investido → o que o talhão devolveu. */
function HarvestResult({ result, onClose }: { result: HarvestedPlanting; onClose: () => void }) {
  return <div className="grid gap-4" data-testid="planting-harvest-result">
    <p className="text-sm leading-5">Colheita de <strong>{result.cropName}</strong> registrada! Para o talhão dar resultado, você investiu:</p>
    <InputsList inputs={result.inputs} title="Investido no plantio" />
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#fffef9] px-4 py-3 shadow-sm">
      <span className="inline-flex items-center gap-2 text-sm font-bold"><Wheat size={18} aria-hidden /> Colhido</span>
      <strong className="text-lg tabular-nums">{result.harvestQuantity} {result.harvestUnit}</strong>
    </div>
    <Button onClick={onClose}>Fechar</Button>
  </div>;
}

/**
 * Folha da Plantação: plantar (insumos + duração configurável) → acompanhar o
 * crescimento → colher, com o resumo do que foi gasto vs. colhido. O progresso
 * re-deriva a cada segundo com o mesmo cálculo do servidor.
 */
export function GamePlantacaoSheet({ open, planting, onClose, onPlanted, onHarvested, onCancelled, onOpenLoja }: {
  open: boolean;
  planting: GamePlanting | null;
  onClose: () => void;
  onPlanted: (planting: GamePlanting) => void;
  onHarvested: (result: HarvestedPlanting) => void;
  onCancelled: (planting: GamePlanting) => void;
  onOpenLoja: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<HarvestedPlanting | null>(null);
  useEffect(() => {
    if (!open || !planting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, planting]);

  const progress = useMemo(
    () => (planting ? growthProgress(planting.plantedAt, planting.durationHours, new Date(now)) : 0),
    [planting, now],
  );
  const stage = planting ? growthStage(progress) : 'EMPTY';
  const subtitle = result
    ? 'Colheita registrada.'
    : !planting
      ? 'Talhão vazio: plante com sementes e insumos.'
      : stage === 'READY'
        ? 'Pronto para colher!'
        : 'Crescendo no ritmo do relógio.';

  return <GameSheet open={open} label="Plantação" testid="game-plantacao-sheet" title="Plantação" subtitle={subtitle} onClose={onClose}
    sprite={<PlantacaoSprite x={32} y={32} size={64} stage={result ? 'EMPTY' : stage === 'EMPTY' ? 'EMPTY' : stage} />}>
    <div className="game-sheet-body">
      {result
        ? <HarvestResult result={result} onClose={onClose} />
        : !planting
          ? <div className="grid gap-3">
            <p className="inline-flex items-center gap-2 text-sm text-[#6b6e60]"><Sprout size={16} aria-hidden /> O plantio usa insumos do Depósito (compre na Loja) e o ciclo corre no relógio — quando terminar, o talhão fica dourado e a colheita libera.</p>
            <PlantForm onPlanted={onPlanted} onOpenLoja={onOpenLoja} />
          </div>
          : stage === 'READY'
            ? <HarvestForm planting={planting} onHarvested={(harvested) => { setResult(harvested); onHarvested(harvested); }} />
            : <GrowingView planting={planting} progress={progress} onCancelled={onCancelled} />}
    </div>
  </GameSheet>;
}
