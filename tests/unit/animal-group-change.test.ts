import { describe, expect, it } from 'vitest';
import { milkTargetGroupIssue, planDatedGroupChange, planInferredGroupChange } from '../../src/domain/animal-group-change';

describe('mudança histórica de lote', () => {
  it('divide o vínculo válido na data e preserva o intervalo posterior', () => {
    const plan = planDatedGroupChange([
      { id: 'old', groupId: 'group-1', startedOn: '2026-01-01', endedOn: '2026-08-10' },
      { id: 'later', groupId: 'group-3', startedOn: '2026-08-10', endedOn: null },
    ], 'group-2', '2026-07-28');

    expect(plan).toEqual({
      kind: 'APPLY',
      closeAssignmentId: 'old',
      closeOn: '2026-07-28',
      insert: {
        groupId: 'group-2',
        startedOn: '2026-07-28',
        endedOn: '2026-08-10',
      },
    });
  });

  it('não cria mudança quando o animal já estava no lote informado', () => {
    expect(planDatedGroupChange([
      { id: 'current', groupId: 'group-2', startedOn: '2026-01-01', endedOn: null },
    ], 'group-2', '2026-07-28')).toEqual({
      kind: 'NO_CHANGE',
      assignmentId: 'current',
    });
  });

  it('rejeita troca entre lotes diferentes no mesmo dia', () => {
    expect(planDatedGroupChange([
      { id: 'current', groupId: 'group-1', startedOn: '2026-07-28', endedOn: null },
    ], 'group-2', '2026-07-28')).toEqual({
      kind: 'CONFLICT',
      reason: 'SAME_DAY_CONFLICT',
    });
  });

  it('rejeita histórico já sobreposto em vez de escolher um vínculo arbitrário', () => {
    expect(planDatedGroupChange([
      { id: 'first', groupId: 'group-1', startedOn: '2026-01-01', endedOn: '2026-08-10' },
      { id: 'second', groupId: 'group-2', startedOn: '2026-07-01', endedOn: null },
    ], 'group-3', '2026-07-28')).toEqual({
      kind: 'CONFLICT',
      reason: 'OVERLAPPING_HISTORY',
    });
  });

  it('não inventa vínculo quando não havia lote válido na data', () => {
    expect(planDatedGroupChange([
      { id: 'future', groupId: 'group-1', startedOn: '2026-08-01', endedOn: null },
    ], 'group-2', '2026-07-28')).toEqual({
      kind: 'CONFLICT',
      reason: 'NO_ASSIGNMENT_ON_DATE',
    });
  });

  it('só propõe inferência para vínculo exato conhecido fora do lote', () => {
    const history = [
      { id: 'current', groupId: 'group-1', startedOn: '2026-01-01', endedOn: null },
    ];

    expect(planInferredGroupChange('FUZZY', history, 'group-2', '2026-07-28')).toBeNull();
    expect(planInferredGroupChange('CONTEXTUAL_TAG', history, 'group-2', '2026-07-28')).toBeNull();
    expect(planInferredGroupChange('EXACT', history, 'group-2', '2026-07-28')).toMatchObject({
      kind: 'APPLY',
      closeAssignmentId: 'current',
    });
  });

  it('rejeita lote inativo ou sem ordenha no salvamento', () => {
    expect(milkTargetGroupIssue({ active: false, milkingRoutine: 'MORNING_ONLY' })).toBe('GROUP_INACTIVE');
    expect(milkTargetGroupIssue({ active: true, milkingRoutine: 'NOT_MILKED' })).toBe('GROUP_NOT_MILKED');
    expect(milkTargetGroupIssue({ active: true, milkingRoutine: 'MORNING_AND_AFTERNOON' })).toBeNull();
  });
});
