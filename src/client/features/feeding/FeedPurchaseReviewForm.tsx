import { useState } from 'react';
import type { FeedUnit } from '../../../domain/feeding';
import { normalizeLabel } from '../../../domain/format';
import { resolveFeedQuantity } from '../../../domain/nl/resolve';
import { ErrorState, Field, Input, Select, SkeletonList } from '../../components/ui';
import { ParsedDecimalInput } from '../../components/form-controls';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { commitReviewAction, type ReviewableAction } from '../game/review';

type FeedItemOption = { id: string; name: string; canonicalUnit: 'KG' | 'LITER' | 'UNIT'; active: boolean };
type SupplierOption = { id: string; name: string };
const feedUnitShort: Record<string, string> = { KG: 'kg', LITER: 'L', UNIT: 'un' };

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : value === null || value === undefined || value === '' ? null : Number(value);
}

function inferredFeedUnit(unitLabel: unknown): FeedUnit | '' {
  const unit = normalizeLabel(String(unitLabel ?? ''));
  if (['kg', 'quilo', 'quilos', 'quilograma', 'quilogramas', 't', 'tonelada', 'toneladas'].includes(unit)) return 'KG';
  if (['l', 'litro', 'litros'].includes(unit)) return 'LITER';
  if (['un', 'unidade', 'unidades'].includes(unit)) return 'UNIT';
  return '';
}

/**
 * Revisão da compra de alimento falada/fotografada dentro da folha do
 * Depósito: o formulário real de entrada de estoque já preenchido pela
 * interpretação. Resolve item (selecionar, cadastrar ou reativar) e fornecedor
 * sem abandonar o documento; cadastros novos, compra e crédito de estoque são
 * confirmados na mesma transação pelo commit da ação proposta. Os rótulos dos
 * campos são estáveis — a revisão OCR do e2e depende deles.
 */
export function FeedPurchaseReviewForm({ action, onCommitted }: {
  action: ReviewableAction;
  onCommitted: () => void;
}) {
  const { data: feedItemsData, loading: loadingItems, error: itemsError, reload: reloadItems } = useResource<FeedItemOption[]>('/api/feed-items');
  const { data: suppliersData } = useResource<SupplierOption[]>('/api/suppliers');
  const { busy, error, run } = useSubmit();
  const feedItems = feedItemsData ?? [];
  const suppliers = suppliersData ?? [];
  const payload = action.resolvedPayload ?? {};
  const suggestedNewItemUnit = inferredFeedUnit(payload.spokenUnit);
  const [date, setDate] = useState(String(payload.purchaseDate ?? ''));
  const [feedItemId, setFeedItemId] = useState(payload.feedItemId ? String(payload.feedItemId) : '');
  const [creatingItem, setCreatingItem] = useState(!payload.feedItemId);
  const [newItemName, setNewItemName] = useState(String(payload.itemLabel ?? ''));
  const [newItemUnit, setNewItemUnit] = useState<FeedUnit | ''>(suggestedNewItemUnit);
  const [quantity, setQuantity] = useState<number | null>(() => {
    const resolvedQuantity = num(payload.quantity);
    const spokenQuantity = num(payload.spokenQuantity);
    if (resolvedQuantity !== null || spokenQuantity === null || !suggestedNewItemUnit) return resolvedQuantity;
    return resolveFeedQuantity(spokenQuantity, payload.spokenUnit ? String(payload.spokenUnit) : null, suggestedNewItemUnit).quantity;
  });
  const [amount, setAmount] = useState<number | null>(num(payload.totalAmount));
  const [supplierChoice, setSupplierChoice] = useState(payload.supplierId ? String(payload.supplierId) : payload.supplierLabel ? '' : 'NONE');
  const [newSupplierName, setNewSupplierName] = useState(String(payload.supplierLabel ?? ''));
  const [quantityConfirmed, setQuantityConfirmed] = useState(payload.quantitySource !== 'DOCUMENT_OCR' || payload.quantityConfirmed === true);
  const item = feedItems.find((row) => row.id === feedItemId) ?? null;
  const inactiveMatch = feedItems.find((row) => !row.active && normalizeLabel(row.name) === normalizeLabel(String(payload.itemLabel ?? ''))) ?? null;
  const unit = creatingItem ? newItemUnit : item?.canonicalUnit;
  const requiresSupplierChoice = Boolean(payload.supplierLabel);
  const supplierReady = supplierChoice === 'CREATE' ? Boolean(newSupplierName.trim()) : supplierChoice === 'NONE' || Boolean(supplierChoice);
  const itemReady = creatingItem ? Boolean(newItemName.trim() && newItemUnit) : Boolean(item);
  const canSave = Boolean(date && itemReady && quantity !== null && quantity > 0 && amount !== null && amount > 0 && quantityConfirmed && (!requiresSupplierChoice || supplierReady));
  const spoken = payload.spokenQuantity !== null && payload.spokenQuantity !== undefined ? `${payload.spokenQuantity} ${payload.spokenUnit ?? ''}`.trim() : null;

  function applyUnit(nextUnit: FeedUnit) {
    setNewItemUnit(nextUnit);
    const spokenQuantity = num(payload.spokenQuantity);
    if (spokenQuantity === null) return;
    const resolved = resolveFeedQuantity(spokenQuantity, payload.spokenUnit ? String(payload.spokenUnit) : null, nextUnit);
    if (resolved.quantity !== null) setQuantity(resolved.quantity);
  }

  function chooseExistingItem(id: string) {
    setFeedItemId(id);
    setCreatingItem(false);
    const selected = feedItems.find((row) => row.id === id);
    const spokenQuantity = num(payload.spokenQuantity);
    if (!selected || spokenQuantity === null) return;
    const resolved = resolveFeedQuantity(spokenQuantity, payload.spokenUnit ? String(payload.spokenUnit) : null, selected.canonicalUnit);
    if (resolved.quantity !== null) setQuantity(resolved.quantity);
  }

  async function confirm() {
    await run(async () => {
      await commitReviewAction(action, {
        ...payload,
        purchaseDate: date,
        feedItemId: creatingItem ? null : feedItemId,
        reactivateFeedItem: !creatingItem && !item?.active,
        newFeedItem: creatingItem ? { name: newItemName.trim(), canonicalUnit: newItemUnit } : null,
        quantity,
        quantityConfirmed,
        totalAmount: amount,
        supplierId: supplierChoice && !['CREATE', 'NONE'].includes(supplierChoice) ? supplierChoice : null,
        newSupplierName: supplierChoice === 'CREATE' ? newSupplierName.trim() : null,
        supplierResolution: supplierChoice === 'NONE' ? 'NONE' : 'LINKED',
        description: `Compra de ${creatingItem ? newItemName.trim() : item?.name ?? 'alimento'}`,
      });
      onCommitted();
    });
  }

  if (loadingItems && !feedItemsData) return <SkeletonList rows={3} />;
  if (itemsError) return <ErrorState message={itemsError} retry={() => void reloadItems()} />;

  return <div className="grid gap-3">
    {error && <ErrorState message={error} />}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Data"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <Field label="Item do catálogo">
        <Select value={creatingItem ? '' : feedItemId} onChange={(event) => event.target.value && chooseExistingItem(event.target.value)}>
          <option value="">Selecione…</option>
          {feedItems.filter((row) => row.active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </Select>
      </Field>
    </div>

    {!creatingItem && inactiveMatch && inactiveMatch.id !== feedItemId && <button type="button" className="game-sheet-back" onClick={() => chooseExistingItem(inactiveMatch.id)}>Reativar “{inactiveMatch.name}”</button>}
    {!creatingItem && !inactiveMatch && <button type="button" className="game-sheet-back" onClick={() => { setCreatingItem(true); setFeedItemId(''); if (newItemUnit) applyUnit(newItemUnit); }}>Cadastrar “{newItemName || 'novo item'}”</button>}
    {creatingItem && <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><strong className="block">Novo item do catálogo</strong><span className="text-xs text-[var(--muted)]">Será criado somente ao confirmar esta compra.</span></div>
        {feedItems.some((row) => row.active) && <button type="button" className="game-sheet-back" onClick={() => setCreatingItem(false)}>Usar existente</button>}
      </div>
      {inactiveMatch && <div className="mb-3"><button type="button" className="game-sheet-back" onClick={() => chooseExistingItem(inactiveMatch.id)}>Reativar “{inactiveMatch.name}”</button></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do item"><Input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} /></Field>
        <Field label="Unidade de controle">
          <Select value={newItemUnit} onChange={(event) => applyUnit(event.target.value as FeedUnit)}>
            <option value="">Selecione…</option>
            <option value="KG">Quilos (kg)</option>
            <option value="LITER">Litros (L)</option>
            <option value="UNIT">Unidades</option>
          </Select>
        </Field>
      </div>
    </div>}

    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={unit ? `Quantidade no estoque (${feedUnitShort[unit]})` : 'Quantidade'}>
        <ParsedDecimalInput suffix={unit ? feedUnitShort[unit] : undefined} value={quantity} onValueChange={(next) => { setQuantity(next); if (payload.quantitySource === 'DOCUMENT_OCR') setQuantityConfirmed(false); }} />
      </Field>
      <Field label="Valor total"><ParsedDecimalInput suffix="R$" value={amount} onValueChange={setAmount} /></Field>
    </div>
    {payload.quantitySource === 'DOCUMENT_OCR' && <div className="notice notice-warning">
      <p><strong>Confira o documento.</strong> O OCR informou {spoken ?? 'uma quantidade sem leitura clara'}{payload.rawValueText ? ` (“${String(payload.rawValueText)}”)` : ''}. O valor acima só vira entrada de estoque após sua confirmação.</p>
      <label className="mt-3 flex min-h-11 items-center gap-3 font-semibold">
        <input className="h-5 w-5" type="checkbox" checked={quantityConfirmed} onChange={(event) => setQuantityConfirmed(event.target.checked)} />
        Confirmei quantidade e unidade no documento
      </label>
    </div>}

    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Fornecedor">
        <Select value={supplierChoice} onChange={(event) => setSupplierChoice(event.target.value)}>
          <option value="">{requiresSupplierChoice ? 'Resolva o fornecedor…' : 'Selecione (opcional)…'}</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          {Boolean(payload.supplierLabel) && <option value="CREATE">Cadastrar “{String(payload.supplierLabel)}”</option>}
          <option value="NONE">Salvar sem fornecedor</option>
        </Select>
      </Field>
      {supplierChoice === 'CREATE' && <Field label="Nome do novo fornecedor"><Input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} /></Field>}
    </div>
    <button type="button" className="game-cta" disabled={busy || !canSave} onClick={() => void confirm()}>{busy ? 'Confirmando…' : 'Confirmar compra'}</button>
  </div>;
}
