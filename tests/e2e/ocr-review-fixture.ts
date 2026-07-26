import type { Page, Route } from '@playwright/test';

const capture = {
  id: 'capture-ocr-visual',
  inputKind: 'DOCUMENT',
  status: 'NEEDS_REVIEW',
  transcript: 'DANFE · POWERLAC 120 P · 14.000 kg · DE HEUS · R$ 30.660,00',
  createdAt: '2026-07-24T12:00:00.000Z',
  actions: [{
    id: 'action-ocr-visual',
    captureId: 'capture-ocr-visual',
    actionType: 'FEED_PURCHASE',
    commitStatus: 'NEEDS_REVIEW',
    status: 'NEEDS_REVIEW',
    issues: [
      'Item “POWERLAC 120 P” não está no catálogo de alimentação; selecione ou cadastre antes de confirmar.',
      'Fornecedor “DE HEUS IND E COM DE NUTRICAO ANIMAL LTDA” não cadastrado; selecione, cadastre ou confirme que deseja salvar sem vínculo.',
      'Confirme a quantidade e a unidade extraídas do documento antes de salvar.',
    ],
    resolvedPayload: {
      purchaseDate: '2026-04-27',
      itemLabel: 'POWERLAC 120 P',
      spokenQuantity: 14000,
      spokenUnit: 'kg',
      rawValueText: 'QTD 14,00 · peso líquido 14.000,00 kg',
      quantity: null,
      totalAmount: 30660,
      supplierLabel: 'DE HEUS IND E COM DE NUTRICAO ANIMAL LTDA',
      quantitySource: 'DOCUMENT_OCR',
      quantityConfirmed: false,
      status: 'OPEN',
    },
  }],
};

export async function mockOcrFeedPurchaseReview(page: Page): Promise<() => Promise<void>> {
  const matcher = (url: URL) => url.pathname === '/api/captures';
  const handler = async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([capture]) });
  };
  await page.route(matcher, handler);
  return () => page.unroute(matcher, handler);
}
