import { Plus, Trash2 } from 'lucide-react';
import { parseDecimal } from '../../../domain/format';
import { feedUnitSuffix } from '../../../domain/feeding';
import { DecimalInput } from '../../components/form-controls';
import { Button, Field, Select } from '../../components/ui';
import { parsedLineQuantity, emptyFeedLine, type FeedLineDraft } from './lines';
import type { FeedInventoryRow } from './types';
import { formatFeedQuantity } from './types';

/**
 * Editor de linhas item+quantidade compartilhado por compra e trato. Mostra o
 * saldo derivado de cada item ao lado da linha — o aviso de uso além do saldo
 * vem do servidor (409 BEYOND_BALANCE), aqui é só transparência.
 */
export function FeedLinesEditor({ lines, inventory, onChange }: {
  lines: FeedLineDraft[];
  inventory: FeedInventoryRow[];
  onChange: (lines: FeedLineDraft[]) => void;
}) {
  const activeItems = inventory.filter((row) => row.active);

  function update(index: number, patch: Partial<FeedLineDraft>) {
    onChange(lines.map((line, current) => (current === index ? { ...line, ...patch } : line)));
  }

  return <div className="grid gap-3">
    {lines.map((line, index) => {
      const item = inventory.find((row) => row.feedItemId === line.feedItemId) ?? null;
      const suffix = item ? feedUnitSuffix[item.canonicalUnit] : '';
      return <div key={index} className="rounded-xl border border-[var(--border)] p-3" data-testid={`feed-line-${index}`}>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <Field label={index === 0 ? 'Item' : `Item ${index + 1}`}>
            <Select value={line.feedItemId} onChange={(event) => update(index, { feedItemId: event.target.value, unit: 'CANONICAL' })}>
              <option value="">Selecione…</option>
              {activeItems.map((row) => <option key={row.feedItemId} value={row.feedItemId}>{row.name}</option>)}
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label={index === 0 ? 'Quantidade' : `Quantidade ${index + 1}`}>
                <DecimalInput value={line.quantity} maximumFractionDigits={3} onValueChange={(value) => update(index, { quantity: value })} suffix={item && line.unit === 'CANONICAL' ? suffix : undefined} />
              </Field>
            </div>
            {item?.canonicalUnit === 'KG' && <Select aria-label={`Unidade digitada ${index + 1}`} className="w-20 shrink-0" value={line.unit} onChange={(event) => update(index, { unit: event.target.value as FeedLineDraft['unit'] })}>
              <option value="CANONICAL">kg</option>
              <option value="TONS">t</option>
            </Select>}
          </div>
          {lines.length > 1 && <div className="flex items-end"><Button type="button" variant="secondary" aria-label={`Remover item ${index + 1}`} onClick={() => onChange(lines.filter((_, current) => current !== index))}><Trash2 size={16} aria-hidden /></Button></div>}
        </div>
        {item && <p className="mt-2 text-xs text-[var(--muted)]" data-testid={`feed-line-balance-${index}`}>
          Saldo em estoque: <strong>{formatFeedQuantity(item.balance, item.canonicalUnit)}</strong>
          {line.unit === 'TONS' && parseDecimal(line.quantity) !== null && <> · {parseDecimal(line.quantity)!.toLocaleString('pt-BR')} t = {formatFeedQuantity(parsedLineQuantity(line) ?? 0, 'KG')}</>}
        </p>}
      </div>;
    })}
    <Button type="button" variant="secondary" onClick={() => onChange([...lines, emptyFeedLine()])}><Plus size={16} aria-hidden />Adicionar item</Button>
  </div>;
}
