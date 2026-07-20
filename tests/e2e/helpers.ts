import { expect, type Page } from '@playwright/test';

export async function login(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.APP_PASSWORD ?? 'senha-local-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
}

type GameMapFixture = {
  zones: Array<{ id: string; kind: string; name: string; pastureId: string | null; herdGroupId: string | null; ring: Array<{ lat: number; lng: number }> }>;
  installations: Array<{ id: string; kind: string; name: string }>;
};

/** Anel de exemplo (quadrado ~400m) usado pelas fixtures do jogo. */
export const FIXTURE_RING = [
  { lat: -21.12, lng: -45.65 },
  { lat: -21.12, lng: -45.646 },
  { lat: -21.124, lng: -45.646 },
  { lat: -21.124, lng: -45.65 },
];

/** Remove todo o mapa do jogo (pastos → perímetro → instalações), para specs idempotentes. */
export async function clearGameMap(page: Page) {
  await page.evaluate(async () => {
    const state = await fetch('/api/game/map').then((response) => response.json()) as {
      zones: Array<{ id: string; kind: string }>;
      installations: Array<{ id: string }>;
    };
    for (const installation of state.installations) await fetch(`/api/game/map/installations/${installation.id}`, { method: 'DELETE' });
    for (const zone of state.zones.filter((item) => item.kind === 'PASTURE')) await fetch(`/api/game/map/zones/${zone.id}`, { method: 'DELETE' });
    for (const zone of state.zones.filter((item) => item.kind === 'PERIMETER')) await fetch(`/api/game/map/zones/${zone.id}`, { method: 'DELETE' });
  });
}

/**
 * Garante um mapa mínimo do jogo (perímetro + 1 pasto real ocupado pelo
 * primeiro lote ativo + mangueira) criado direto pela API — rápido e
 * independente do editor. A zona desenha o pasto real (pastureId); o lote
 * exibido nela é derivado da ocupação aberta. Reutiliza o que já existir
 * (padrão serial do repo).
 */
export async function createGameMapFixture(page: Page): Promise<GameMapFixture> {
  return page.evaluate(async (ring) => {
    const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let state = await fetch('/api/game/map').then((response) => response.json()) as GameMapFixture;
    if (!state.zones.some((zone) => zone.kind === 'PERIMETER')) {
      await fetch('/api/game/map/zones', json({ kind: 'PERIMETER', name: 'Sítio', ring }));
    }
    if (!state.zones.some((zone) => zone.kind === 'PASTURE')) {
      // Pasto real primeiro; a zona do mapa apenas desenha esse pasto.
      const pastures = await fetch('/api/pastures').then((response) => response.json()) as Array<{ id: string; name: string; active: boolean; currentOccupancy: { herdGroupId: string } | null }>;
      let pasture = pastures.find((item) => item.name === 'Pasto da Frente' && item.active) ?? null;
      if (!pasture) {
        pasture = await fetch('/api/pastures', json({ name: 'Pasto da Frente' })).then((response) => response.json()) as typeof pasture;
      }
      if (pasture && !pasture.currentOccupancy) {
        const groups = await fetch('/api/herd-groups').then((response) => response.json()) as Array<{ id: string; active: boolean }>;
        const group = groups.find((item) => item.active);
        if (group) await fetch(`/api/herd-groups/${group.id}/pasture`, json({ pastureId: pasture.id, movedOn: today }));
      }
      const inner = [
        { lat: ring[0].lat - 0.0005, lng: ring[0].lng + 0.0005 },
        { lat: ring[0].lat - 0.0005, lng: ring[0].lng + 0.002 },
        { lat: ring[0].lat - 0.002, lng: ring[0].lng + 0.002 },
        { lat: ring[0].lat - 0.002, lng: ring[0].lng + 0.0005 },
      ];
      await fetch('/api/game/map/zones', json({ kind: 'PASTURE', name: 'Pasto da Frente', pastureId: pasture?.id ?? null, ring: inner }));
    }
    // As instalações são posicionadas RELATIVAS ao perímetro ativo (que pode
    // ter sido traçado pelo teste do editor, com extensão diferente do
    // FIXTURE_RING) — senão elas caem fora do viewBox projetado.
    state = await fetch('/api/game/map').then((response) => response.json()) as GameMapFixture;
    const perimeterRing = state.zones.find((zone) => zone.kind === 'PERIMETER')?.ring ?? ring;
    const lats = perimeterRing.map((point) => point.lat);
    const lngs = perimeterRing.map((point) => point.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const at = (latFraction: number, lngFraction: number) => ({
      lat: minLat + (maxLat - minLat) * latFraction,
      lng: minLng + (maxLng - minLng) * lngFraction,
    });
    const wanted: Array<{ kind: string; name: string; position: { lat: number; lng: number } }> = [
      { kind: 'MANGUEIRA', name: 'Mangueira', position: at(0.5, 0.5) },
      { kind: 'DEPOSITO', name: 'Depósito', position: at(0.68, 0.32) },
      { kind: 'ESTACAO_ALIMENTACAO', name: 'Estação de alimentação', position: at(0.3, 0.35) },
      { kind: 'GARAGEM', name: 'Garagem', position: at(0.66, 0.68) },
    ];
    for (const installation of wanted) {
      const existing = state.installations.find((row) => row.kind === installation.kind);
      if (!existing) {
        await fetch('/api/game/map/installations', json(installation));
      } else {
        // Reposiciona sempre: o banco pode guardar uma posição de um perímetro
        // antigo (fora do viewBox atual), o que quebraria os cliques.
        await fetch(`/api/game/map/installations/${existing.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ position: installation.position }),
        });
      }
    }
    state = await fetch('/api/game/map').then((response) => response.json()) as GameMapFixture;
    return state;
  }, FIXTURE_RING);
}

type GameMapFixtureShape = Awaited<ReturnType<typeof createGameMapFixture>>;
export type { GameMapFixtureShape };
