import { useState } from 'react';
import { parseDecimal } from '../../../domain/format';
import { feedUnitSuffix, tonsToKg } from '../../../domain/feeding';
import { GUARDRAILS, rangeError } from '../../../domain/guardrails';
import { DecimalInput, MoneyInput } from '../../components/form-controls';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select, SubmitBar } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import type { FeedInventoryRow } from './types';
import { formatFeedQuantity } from './types';

type PurchaseOption = { id: string; purchaseDate: string; description: string; totalAmount: string; status: string };

/**
 * Compra de alimento pelo Depósito. A compra é o fato financeiro REAL de
 * sempre (/api/purchases); a feed_purchase_entry só credita o inventário.
 * Também dá para vincular uma compra já registrada. Toneladas viram kg no
 * formulário (×1000) — o banco só vê a unidade canônica.
 */
export function FeedPurchaseForm({ onSaved }: { onSaved: () => void }) {
  const { busy, error, run } = useSubmit();
  const { data: inventory } = useResource<FeedInventoryRow[]>('/api/feed-inventory');
  const { data: purchases } = useResource<PurchaseOption[]>('/api/purchases');
  const [mode, setMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [feedItemId, setFeedItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<'CANONICAL' | 'TONS'>('CANONICAL');
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paid, setPaid] = useState(false);
  const [existingPurchaseId, setExistingPurchaseId] = useState('');
  const [formError, setFormError] = useState('');

  const item = inventory?.find((row) => row.feedItemId === feedItemId) ?? null;
  const openPurchases = purchases?.filter((purchase) => purchase.status !== 'CANCELLED') ?? [];

  function canonicalQuantity(): number | null {
    const parsed = parseDecimal(quantity);
    if (parsed === null || parsed <= 0) return null;
    return unit === 'TONS' ? tonsToKg(parsed) : parsed;
  }

  function validate(): boolean {
    if (!feedItemId) { setFormError('Selecione o item do catálogo.'); return false; }
    const parsed = canonicalQuantity();
    if (parsed === null) { setFormError('Informe uma quantidade maior que zero.'); return false; }
    const range = rangeError(parsed, GUARDRAILS.feedQuantity);
    if (range) { setFormError(range); return false; }
    if (mode === 'NEW') {
      if (!purchaseDate) { setFormError('Informe a data da compra.'); return false; }
      const parsedAmount = parseDecimal(amount);
      if (parsedAmount === null || parsedAmount <= 0) { setFormError('Informe o valor total da compra.'); return false; }
    } else if (!existingPurchaseId) {
      setFormError('Selecione a compra registrada.');
      return false;
    }
    setFormError('');
    return true;
  }

  async function persist() {
    const parsed = canonicalQuantity()!;
    let purchaseId = existingPurchaseId;
    if (mode === 'NEW') {
      const created = await api<{ id: string }>('/api/purchases', json('POST', {
        purchaseDate,
        description: description.trim() || `Compra de ${item?.name ?? 'alimento'}`,
        category: 'FEED',
        totalAmount: parseDecimal(amount),
        status: paid ? 'PAID' : 'OPEN',
      }));
      purchaseId = created.id;
    }
    await api('/api/feed-purchase-entries', json('POST', { feedItemId, purchaseId, quantity: parsed }));
    onSaved();
  }

  return <form className="grid gap-4" noValidate data-testid="feed-purchase-form" onSubmit={(event) => { event.preventDefault(); if (validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={formError ? [formError] : []} />
    <div className="flex gap-2">
      <Button type="button" variant={mode === 'NEW' ? 'primary' : 'secondary'} onClick={() => setMode('NEW')}>Nova compra</Button>
      <Button type="button" variant={mode === 'EXISTING' ? 'primary' : 'secondary'} onClick={() => setMode('EXISTING')}>Vincular compra existente</Button>
    </div>
    <Field label="Item do catálogo">
      <Select value={feedItemId} onChange={(event) => { setFeedItemId(event.target.value); setUnit('CANONICAL'); }} required>
        <option value="">Selecione…</option>
        {inventory?.filter((row) => row.active).map((row) => <option key={row.feedItemId} value={row.feedItemId}>{row.name}</option>)}
      </Select>
    </Field>
    {item && <p className="text-xs text-[var(--muted)]">Saldo atual: <strong data-testid="feed-purchase-balance">{formatFeedQuantity(item.balance, item.canonicalUnit)}</strong></p>}
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Field label="Quantidade comprada">
          <DecimalInput value={quantity} maximumFractionDigits={3} onValueChange={setQuantity} suffix={item && unit === 'CANONICAL' ? feedUnitSuffix[item.canonicalUnit] : undefined} />
        </Field>
      </div>
      {item?.canonicalUnit === 'KG' && <Select aria-label="Unidade digitada" className="w-20 shrink-0" value={unit} onChange={(event) => setUnit(event.target.value as 'CANONICAL' | 'TONS')}>
        <option value="CANONICAL">kg</option>
        <option value="TONS">t</option>
      </Select>}
    </div>
    {mode === 'NEW' && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data da compra"><Input type="date" value={purchaseDate} max={today()} onChange={(event) => setPurchaseDate(event.target.value)} required /></Field>
        <Field label="Valor total"><MoneyInput value={amount} onValueChange={setAmount} required /></Field>
      </div>
      <Field label="Descrição" hint="Opcional; por padrão usa o nome do item.">
        <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={item ? `Compra de ${item.name}` : 'Compra de alimento'} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input className="h-5 w-5" type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />Compra já paga
      </label>
    </>}
    {mode === 'EXISTING' && <Field label="Compra registrada">
      <Select value={existingPurchaseId} onChange={(event) => setExistingPurchaseId(event.target.value)} required>
        <option value="">Selecione…</option>
        {openPurchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.purchaseDate} · {purchase.description}</option>)}
      </Select>
    </Field>}
    <SubmitBar label="Registrar compra de alimento" busy={busy} />
  </form>;
}
