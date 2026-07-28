import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/server/http/api-error';
import { daysBetween, planPastureMove, planSubdivision, subdivisionName, summarizePastures } from '../../src/server/services/pasture.service';

describe('daysBetween', () => {
  it('conta a diferença exata entre datas, sem interpolar', () => {
    expect(daysBetween('2026-07-01', '2026-07-01')).toBe(0);
    expect(daysBetween('2026-07-01', '2026-07-11')).toBe(10);
    expect(daysBetween('2026-06-28', '2026-07-02')).toBe(4);
  });
});

describe('summarizePastures', () => {
  const groups = [{ id: 'g-1', name: 'Lote 1' }, { id: 'g-2', name: 'Lote 2' }];
  const pastureRows = [
    { id: 'p-1', name: 'Pasto 1', areaHa: '4.50', active: true },
    { id: 'p-2', name: 'Pasto 2', areaHa: null, active: true },
    { id: 'p-3', name: 'Pasto 3', areaHa: null, active: true },
  ];

  it('pasto ocupado expõe lote, início e dias de uso', () => {
    const [summary] = summarizePastures(pastureRows, [
      { id: 'o-1', pastureId: 'p-1', herdGroupId: 'g-1', startedOn: '2026-07-05', endedOn: null },
    ], groups, '2026-07-20');
    expect(summary.currentOccupancy).toEqual({
      occupancyId: 'o-1',
      herdGroupId: 'g-1',
      herdGroupName: 'Lote 1',
      startedOn: '2026-07-05',
      occupiedDays: 15,
    });
    expect(summary.restDays).toBeNull();
  });

  it('pasto livre deriva descanso da última ocupação encerrada', () => {
    const summaries = summarizePastures(pastureRows, [
      { id: 'o-1', pastureId: 'p-2', herdGroupId: 'g-1', startedOn: '2026-05-01', endedOn: '2026-06-10' },
      { id: 'o-2', pastureId: 'p-2', herdGroupId: 'g-2', startedOn: '2026-06-15', endedOn: '2026-07-10' },
    ], groups, '2026-07-20');
    const livre = summaries.find((summary) => summary.id === 'p-2');
    expect(livre?.currentOccupancy).toBeNull();
    expect(livre?.restDays).toBe(10);
  });

  it('pasto nunca ocupado não tem descanso calculável', () => {
    const summaries = summarizePastures(pastureRows, [], groups, '2026-07-20');
    const novo = summaries.find((summary) => summary.id === 'p-3');
    expect(novo?.currentOccupancy).toBeNull();
    expect(novo?.restDays).toBeNull();
  });
});

describe('planPastureMove', () => {
  const base = {
    groupId: 'g-1',
    movedOn: '2026-07-20',
    pasture: { id: 'p-2', active: true },
    groupOpenOccupancy: { id: 'o-1', pastureId: 'p-1', startedOn: '2026-07-01' },
    pastureOpenOccupancy: null,
  };

  function expectRejection(input: Parameters<typeof planPastureMove>[0], status: number, code: string) {
    try {
      planPastureMove(input);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
      expect((error as ApiError).code).toBe(code);
      return;
    }
    expect.unreachable('a movimentação deveria ter sido rejeitada');
  }

  it('mover fecha a ocupação aberta do lote e abre a nova na mesma data', () => {
    const plan = planPastureMove({ ...base, pastureId: 'p-2' });
    expect(plan).toEqual({
      closeOccupancyId: 'o-1',
      insert: { pastureId: 'p-2', herdGroupId: 'g-1', startedOn: '2026-07-20' },
      noop: false,
    });
  });

  it('rejeita segundo lote no mesmo pasto (exclusividade do pasto)', () => {
    expectRejection({ ...base, pastureId: 'p-2', pastureOpenOccupancy: { herdGroupId: 'g-2' } }, 409, 'PASTURE_OCCUPIED');
  });

  it('aceita o lote que já ocupa o pasto sem criar segunda ocupação', () => {
    const plan = planPastureMove({ ...base, pastureId: 'p-1', pastureOpenOccupancy: { herdGroupId: 'g-1' } });
    expect(plan.noop).toBe(true);
    expect(plan.insert).toBeNull();
  });

  it('lote nunca fica com dois pastos: a ocupação anterior é sempre fechada', () => {
    const plan = planPastureMove({ ...base, pastureId: 'p-2' });
    expect(plan.closeOccupancyId).toBe('o-1');
    expect(plan.insert?.herdGroupId).toBe('g-1');
  });

  it('rejeita pasto inativo', () => {
    expectRejection({ ...base, pastureId: 'p-2', pasture: { id: 'p-2', active: false } }, 409, 'PASTURE_INACTIVE');
  });

  it('rejeita pasto inexistente', () => {
    expectRejection({ ...base, pastureId: 'p-9', pasture: null }, 404, 'PASTURE_NOT_FOUND');
  });

  it('rejeita data anterior ao início da ocupação que está sendo fechada', () => {
    expectRejection({ ...base, pastureId: 'p-2', movedOn: '2026-06-30' }, 400, 'INVALID_MOVE_DATE');
  });

  it('retirar do pasto (pastureId null) fecha a ocupação sem abrir destino', () => {
    const plan = planPastureMove({ ...base, pastureId: null, pasture: null });
    expect(plan).toEqual({ closeOccupancyId: 'o-1', insert: null, noop: false });
  });

  it('retirar lote que já está fora de pasto não faz nada', () => {
    const plan = planPastureMove({ ...base, pastureId: null, pasture: null, groupOpenOccupancy: null });
    expect(plan).toEqual({ closeOccupancyId: null, insert: null, noop: false });
  });

  it('lote fora de pasto entra direto, sem ocupação para fechar', () => {
    const plan = planPastureMove({ ...base, pastureId: 'p-2', groupOpenOccupancy: null });
    expect(plan).toEqual({
      closeOccupancyId: null,
      insert: { pastureId: 'p-2', herdGroupId: 'g-1', startedOn: '2026-07-20' },
      noop: false,
    });
  });
});

describe('planSubdivision', () => {
  // Anel pequeno (~11 m de lado) só para validar a mecânica do plano.
  const ringA = [
    { lat: -21.122, lng: -45.648 },
    { lat: -21.122, lng: -45.6479 },
    { lat: -21.1219, lng: -45.6479 },
  ];
  const ringB = ringA.map((point) => ({ lat: point.lat - 0.0002, lng: point.lng }));

  function expectRejection(baseName: string, rings: { lat: number; lng: number }[][], status: number, code: string) {
    try {
      planSubdivision(baseName, rings);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
      expect((error as ApiError).code).toBe(code);
      return;
    }
    expect.unreachable('a subdivisão deveria ter sido rejeitada');
  }

  it('cada anel vira um pasto com nome de linhagem e área medida pelo traçado', () => {
    const pieces = planSubdivision('Pasto 1', [ringA, ringB]);
    expect(pieces.map((piece) => piece.name)).toEqual(['Pasto 1.a', 'Pasto 1.b']);
    for (const piece of pieces) expect(Number(piece.areaHa)).toBeGreaterThan(0);
    expect(pieces[0].ring).toBe(ringA);
  });

  it('a linhagem segue o alfabeto sem hierarquia', () => {
    expect(subdivisionName('Pasto 1', 0)).toBe('Pasto 1.a');
    expect(subdivisionName('Pasto 1', 2)).toBe('Pasto 1.c');
  });

  it('exige pelo menos duas áreas novas', () => {
    expectRejection('Pasto 1', [ringA], 400, 'SUBDIVISION_MIN_RINGS');
  });

  it('limita a subdivisão guiada a oito áreas por vez', () => {
    expectRejection('Pasto 1', Array.from({ length: 9 }, () => ringA), 400, 'SUBDIVISION_MAX_RINGS');
  });

  it('rejeita anel inválido identificando a área', () => {
    expectRejection('Pasto 1', [ringA, ringA.slice(0, 2)], 400, 'INVALID_RING');
  });
});
