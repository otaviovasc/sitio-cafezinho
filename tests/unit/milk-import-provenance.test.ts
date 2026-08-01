import { describe, expect, it } from 'vitest';
import { deriveMilkImportProvenance, milkSourceActionSetIssue, selectSourceAttachmentIds } from '../../src/domain/milk-import-provenance';

const available = [{
  captureId: 'capture-1',
  proposedActionId: 'action-1',
  rawAnimalLabel: 'Mimosa',
  rawValueText: 'Mimosa 8,5',
  morningLiters: 8.5,
  totalLiters: 8.5,
  confidence: 'HIGH' as const,
}];

describe('proveniência da importação de leite', () => {
  it('usa os valores oficiais da ação e ignora valores falsificados no seletor do cliente', () => {
    const result = deriveMilkImportProvenance([{
      rawAnimalLabel: 'Mimosa',
      sources: [{
        captureId: 'capture-1',
        proposedActionId: 'action-1',
        rawAnimalLabel: 'Mimosa',
      }],
    }], available);

    expect(result).toEqual({
      ok: true,
      sourcesByMeasurement: [available],
    });
  });

  it('rejeita seletor de outra ação ou captura', () => {
    expect(deriveMilkImportProvenance([{
      rawAnimalLabel: 'Mimosa',
      sources: [{
        captureId: 'capture-falsa',
        proposedActionId: 'action-1',
        rawAnimalLabel: 'Mimosa',
      }],
    }], available)).toMatchObject({
      ok: false,
      code: 'SOURCE_NOT_DERIVABLE',
    });
  });

  it('não confirma uma ação deixando linhas oficiais sem proveniência', () => {
    const extra = {
      ...available[0],
      rawAnimalLabel: 'Estrela',
      rawValueText: 'Estrela 7',
    };
    expect(deriveMilkImportProvenance([{
      rawAnimalLabel: 'Mimosa',
    }], [...available, extra])).toEqual({
      ok: false,
      code: 'SOURCE_ACTION_INCOMPLETE',
    });
  });

  it('não usa o anexo legado quando a captura possui capture_documents', () => {
    expect(selectSourceAttachmentIds([
      { ordinal: 1, attachmentId: null },
    ], [1], 'legacy-attachment')).toEqual([]);
    expect(selectSourceAttachmentIds([], [1], 'legacy-attachment')).toEqual(['legacy-attachment']);
  });

  it('rejeita ação que não seja controle individual pendente da mesma captura e escopo', () => {
    const refs = [{ captureId: 'capture-1', actionId: 'action-1' }];
    const base = {
      id: 'action-1',
      captureId: 'capture-1',
      actionType: 'INDIVIDUAL_MILK_SESSION',
      status: 'NEEDS_REVIEW',
      committedRecordType: null,
      committedRecordId: null,
      sessionDate: '2026-07-28',
      herdGroupId: 'group-1',
    };
    const scope = { sessionDate: '2026-07-28', herdGroupId: 'group-1', sessionId: 'session-1' };

    expect(milkSourceActionSetIssue(refs, [base], scope)).toBeNull();
    expect(milkSourceActionSetIssue(refs, [{ ...base, actionType: 'PURCHASE' }], scope))
      .toBe('SOURCE_ACTION_SCOPE_MISMATCH');
    expect(milkSourceActionSetIssue(refs, [{ ...base, status: 'CONFIRMED', committedRecordId: 'other-session' }], scope))
      .toBe('SOURCE_ACTION_ALREADY_REVIEWED');
    expect(milkSourceActionSetIssue(refs, [{ ...base, captureId: 'capture-falsa' }], scope))
      .toBe('SOURCE_ACTION_SCOPE_MISMATCH');
  });

  it('não permite usar a mesma linha oficial como origem de duas medições', () => {
    expect(deriveMilkImportProvenance([
      { rawAnimalLabel: 'Mimosa' },
      { rawAnimalLabel: 'Mimosa' },
    ], available)).toEqual({
      ok: false,
      code: 'SOURCE_REUSED',
    });
  });
});
