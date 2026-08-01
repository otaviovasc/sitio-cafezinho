import type { Page, Route } from '@playwright/test';

const captureId = '11111111-1111-4111-8111-111111111111';
const actionId = '22222222-2222-4222-8222-222222222222';
const secondActionId = '44444444-4444-4444-8444-444444444444';
const groupId = '55555555-5555-4555-8555-555555555555';

const action = {
  id: actionId,
  captureId,
  actionType: 'INDIVIDUAL_MILK_SESSION',
  commitStatus: 'NEEDS_REVIEW',
  status: 'NEEDS_REVIEW',
  issues: [],
  resolvedPayload: {},
};

const related = {
  action,
  import: {
    sessionDate: '2026-07-28',
    herdGroupId: groupId,
    herdGroupLabel: 'Lote 1',
    sourceMode: 'SEPARATE_MORNING_AFTERNOON',
    metadataReview: { dateRequired: false, groupRequired: false, periodRequired: false },
    sourceDocumentOrdinals: [1, 2],
    measurements: [],
  },
  sourceActions: [
    { captureId, actionId },
    { captureId, actionId: secondActionId },
  ],
  documents: [
    { captureId, ordinal: 1, attachmentId: '66666666-6666-4666-8666-666666666666', filename: 'lote-1-manha.jpg', mimeType: 'image/svg+xml', transcript: 'Lote 1 manhã\\nGuaraná - 10\\nManjuba - 5' },
    { captureId, ordinal: 2, attachmentId: null, filename: 'lote-1-tarde.jpg', mimeType: null, transcript: 'Lote 1 tarde\\nGuaraná - 6\\nManfuba - 5', storageWarning: 'O original da Foto 2 não foi armazenado.' },
  ],
};

const preview = {
  sessionDate: '2026-07-28',
  herdGroupId: groupId,
  herdGroupName: 'Lote 1',
  sourceMode: 'SEPARATE_MORNING_AFTERNOON',
  metadataReview: { dateRequired: false, groupRequired: false, periodRequired: false },
  sessionIssues: [],
  sessionWarnings: ['Há 1 vaca do lote sem medição vinculada. Isso não registra ausência nem zero.'],
  missingAnimals: [{ id: '99999999-9999-4999-8999-999999999999', name: 'Pequena', tagNumber: null }],
  existingSession: {
    id: '77777777-7777-4777-8777-777777777777',
    sessionDate: '2026-07-28',
    title: 'Controle importado',
    measurementCount: 1,
    measurements: [{
      id: '88888888-8888-4888-8888-888888888888',
      animalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      animalName: 'Guaraná',
      tagNumber: null,
      rawAnimalLabel: 'Guaraná',
      morningLiters: '10.00',
      afternoonLiters: null,
      totalLiters: '10.00',
      status: 'CONFIRMED',
    }],
  },
  measurements: [
    {
      rawAnimalLabel: 'Guaraná',
      rawValueText: '10 / 6',
      morningLiters: 10,
      afternoonLiters: 6,
      totalLiters: 16,
      confidence: 'HIGH',
      status: 'CONFIRMED',
      notes: null,
      animalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      matchedAnimal: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Guaraná', tagNumber: null },
      milkingRoutine: 'MORNING_AND_AFTERNOON',
      mergeDecision: 'COMPLETE_EXISTING',
      existingMeasurement: {
        id: '88888888-8888-4888-8888-888888888888',
        animalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        animalName: 'Guaraná',
        tagNumber: null,
        rawAnimalLabel: 'Guaraná',
        morningLiters: '10.00',
        afternoonLiters: null,
        totalLiters: '10.00',
        status: 'CONFIRMED',
      },
      issues: [],
      sourceDocumentOrdinals: [1, 2],
      groupChangeProposal: {
        animalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        animalName: 'Guaraná',
        fromGroupId: '12121212-1212-4121-8121-121212121212',
        fromGroupName: 'Lote 2',
        toGroupId: groupId,
        toGroupName: 'Lote 1',
        changedOn: '2026-07-28',
      },
      sources: [],
    },
    {
      rawAnimalLabel: 'Manfuba',
      rawValueText: '5',
      morningLiters: null,
      afternoonLiters: 5,
      totalLiters: 5,
      confidence: 'MEDIUM',
      status: 'NEEDS_REVIEW',
      notes: 'Leitura provável',
      animalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      matchedAnimal: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Manjuba', tagNumber: null },
      milkingRoutine: 'MORNING_AND_AFTERNOON',
      mergeDecision: 'ADD',
      existingMeasurement: null,
      issues: ['Nome parecido com um único animal deste lote; confirme o vínculo sugerido.'],
      sourceDocumentOrdinals: [2],
      groupChangeProposal: null,
      sources: [],
    },
  ],
};

export async function mockIndividualMilkReview(page: Page) {
  const handlers: Array<[string | RegExp, (route: Route) => Promise<void>]> = [
    [`**/api/captures/${captureId}`, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: captureId, actions: [action] }) })],
    ['**/api/import/milk-session/related?*', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(related) })],
    ['**/api/import/milk-session/validate', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview) })],
    ['**/api/attachments/66666666-6666-4666-8666-666666666666/file', async (route) => route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="900"><rect width="100%" height="100%" fill="#eee7d8"/><text x="45" y="90" font-size="34" fill="#21392a">28/07 · Lote 1 · manhã</text><text x="55" y="180" font-size="30" fill="#25335b">Guaraná — 10</text><text x="55" y="240" font-size="30" fill="#25335b">Manjuba — 5</text></svg>',
    })],
  ];
  for (const [url, handler] of handlers) await page.route(url, handler);
  return { captureId, actionId };
}
