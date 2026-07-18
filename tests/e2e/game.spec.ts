import { expect, test } from '@playwright/test';
import { clearGameMap, createGameMapFixture, login } from './helpers';

test.describe('jogo — fundação', () => {
  test('API do jogo exige sessão', async ({ request }) => {
    const response = await request.get('/api/game/state');
    expect(response.status()).toBe(401);
  });

  test('/jogo renderiza o shell e responde ao estado do mapa', async ({ page }) => {
    await login(page);
    await page.goto('/jogo');
    await expect(page.getByTestId('game-root')).toBeVisible();
    const state = await page.evaluate(async () => {
      const response = await fetch('/api/game/state');
      return { status: response.status, body: await response.json() as { map: { zones: Array<{ kind: string }> } } };
    });
    expect(state.status).toBe(200);
    const hasPerimeter = state.body.map.zones.some((zone) => zone.kind === 'PERIMETER');
    if (hasPerimeter) {
      await expect(page.getByTestId('game-empty')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('game-empty')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Começar o traçado' })).toHaveAttribute('href', '/jogo/mapa/editor');
    }
  });

  test('/jogo não carrega o chunk do editor (Leaflet fica fora do bundle inicial)', async ({ page }) => {
    const editorChunkRequests: string[] = [];
    page.on('request', (request) => {
      if (/GameMapEditorPage/.test(request.url())) editorChunkRequests.push(request.url());
    });
    await login(page);
    await page.goto('/jogo');
    await expect(page.getByTestId('game-root')).toBeVisible();
    expect(editorChunkRequests).toEqual([]);
  });
});

test.describe('jogo — editor de mapa', () => {
  test('fluxo completo: localizar, traçar perímetro, pasto vinculado e mangueira', async ({ page }) => {
    await login(page);
    await clearGameMap(page);
    await page.goto('/jogo/mapa/editor');

    // Passo de localização gamificado: colar coordenadas do Google Maps.
    await expect(page.getByTestId('editor-location')).toBeVisible();
    await page.getByLabel('Coordenadas ou link do Maps').fill('-21.122000, -45.648000');
    await page.getByRole('button', { name: 'Centralizar mapa' }).click();

    // Perímetro: cliques no container funcionam mesmo sem tiles.
    await page.getByRole('button', { name: 'Traçar perímetro' }).click();
    const map = page.getByTestId('editor-map');
    await map.click({ position: { x: 100, y: 100 } });
    await map.click({ position: { x: 320, y: 100 } });
    await map.click({ position: { x: 320, y: 300 } });
    await map.click({ position: { x: 100, y: 300 } });
    await page.getByTestId('editor-finish').click();
    await expect(page.getByText('“Sítio” traçado.')).toBeVisible();

    // Pasto vinculado ao Lote 1.
    await page.getByRole('button', { name: 'Adicionar pasto' }).click();
    await map.click({ position: { x: 140, y: 140 } });
    await map.click({ position: { x: 280, y: 140 } });
    await map.click({ position: { x: 280, y: 260 } });
    await page.getByTestId('editor-finish').click();
    await expect(page.getByLabel('Nome do pasto')).toHaveValue('Pasto 1');
    await page.getByLabel('Lote que fica neste pasto').selectOption({ label: 'Lote 1' });
    await page.getByRole('button', { name: 'Salvar pasto' }).click();
    await expect(page.getByText('Pasto 1 — Lote 1')).toBeVisible();

    // Mangueira com um clique.
    await page.getByRole('button', { name: 'Posicionar mangueira' }).click();
    await map.click({ position: { x: 210, y: 210 } });
    await expect(page.getByText('Posicionada. É onde a ordenha acontece no jogo.')).toBeVisible();

    // Persistência: recarrega e tudo continua lá.
    await page.reload();
    await expect(page.getByText('“Sítio” traçado.')).toBeVisible();
    const saved = await page.evaluate(() => fetch('/api/game/map').then((response) => response.json()) as Promise<{ zones: unknown[]; installations: unknown[] }>);
    expect(saved.zones).toHaveLength(2);
    expect(saved.installations).toHaveLength(1);

    // Segundo perímetro é recusado pela API.
    const duplicateStatus = await page.evaluate(async () => {
      const response = await fetch('/api/game/map/zones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'PERIMETER', name: 'Outro', ring: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] }),
      });
      return { status: response.status, code: (await response.json()).error?.code as string };
    });
    expect(duplicateStatus.status).toBe(409);
    expect(duplicateStatus.code).toBe('PERIMETER_EXISTS');
  });
});

test.describe('jogo — tabuleiro', () => {
  test('mapa estilizado renderiza pastos, rebanho com contagem real e curral', async ({ page }) => {
    await login(page);
    const fixture = await createGameMapFixture(page);
    await page.goto('/jogo');

    // Zonas desenhadas (paths do tabuleiro; rótulos têm testid próprio).
    await expect(page.locator('path[data-testid^="game-zone-"]')).toHaveCount(fixture.zones.length);

    const linkedPasture = fixture.zones.find((zone) => zone.kind === 'PASTURE' && zone.herdGroupId);
    if (linkedPasture?.herdGroupId) {
      const groupId = linkedPasture.herdGroupId;
      // Contagem esperada calculada de forma independente via /api/animals.
      const expected = await page.evaluate(async (id) => {
        const rows = await fetch('/api/animals').then((response) => response.json()) as Array<{ status: string; currentGroup: { id: string } | null }>;
        return rows.filter((row) => ['HEIFER', 'LACTATING', 'DRY'].includes(row.status) && row.currentGroup?.id === id).length;
      }, groupId);
      if (expected > 0) {
        await expect(page.getByTestId(`herd-cluster-${groupId}`)).toBeVisible();
        await expect(page.getByTestId(`herd-count-${groupId}`)).toContainText(String(expected));
      } else {
        await expect(page.getByTestId(`herd-cluster-${groupId}`)).toHaveCount(0);
      }
    }

    // Curral: aparece exatamente quando há animais fora do mapa.
    const state = await page.evaluate(() => fetch('/api/game/state').then((response) => response.json()) as Promise<{ unassignedCount: number }>);
    await expect(page.getByTestId('game-corral')).toHaveCount(state.unassignedCount > 0 ? 1 : 0);

    // Pan/zoom: botões alteram o transform da câmera (asserção de atributo).
    const camera = page.getByTestId('game-camera');
    const initialTransform = await camera.getAttribute('transform');
    await page.getByRole('button', { name: 'Aproximar' }).click();
    await expect.poll(() => camera.getAttribute('transform')).not.toBe(initialTransform);
    await page.getByRole('button', { name: 'Centralizar' }).click();
    await expect.poll(() => camera.getAttribute('transform')).toBe(initialTransform);
  });
});

test.describe('jogo — mangueira e HUD', () => {
  test('ordenha e coleta pelo mapa gravam fatos reais, com tanque, caminhão e HUD coerentes', async ({ page }) => {
    await login(page);
    await createGameMapFixture(page);

    // Limpa os fatos de HOJE para o teste ser determinístico e re-executável.
    await page.evaluate(async () => {
      const state = await fetch('/api/game/state').then((response) => response.json()) as { today: { date: string } };
      const today = state.today.date;
      const totals = await fetch('/api/daily-milk-totals').then((response) => response.json()) as Array<{ id: string; productionDate: string; herdGroupId: string | null }>;
      for (const total of totals.filter((row) => row.productionDate === today && row.herdGroupId === null)) {
        await fetch(`/api/daily-milk-totals/${total.id}`, { method: 'DELETE' });
      }
      const collections = await fetch('/api/milk-collections').then((response) => response.json()) as Array<{ id: string; collectionDate: string }>;
      for (const collection of collections.filter((row) => row.collectionDate === today)) {
        await fetch(`/api/milk-collections/${collection.id}`, { method: 'DELETE' });
      }
    });

    await page.goto('/jogo');

    // HUD de economia sem preço do mês pede o cadastro (quando aplicável).
    const initialEconomy = await page.evaluate(() => fetch('/api/game/state').then((response) => response.json()) as Promise<{ economy: { pricePerLiter: number | null } }>);
    if (initialEconomy.economy.pricePerLiter === null) {
      await expect(page.getByTestId('hud-economy').getByRole('link', { name: 'Cadastre o preço do leite' })).toBeVisible();
    }

    // Folha de ações da mangueira: acessível por clique e com as 3 ações.
    await page.getByTestId('game-installation-mangueira').click();
    const sheet = page.getByTestId('game-action-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Registrar produção do dia/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Registrar coleta do laticínio/ })).toBeVisible();
    await expect(sheet.getByRole('link', { name: /Controle individual/ })).toHaveAttribute('href', '/producao/individual/novo');

    // 1) Produção do dia (rebanho todo) → tanque cheio + fato real persistido.
    await sheet.getByRole('button', { name: /Registrar produção do dia/ }).click();
    await sheet.getByLabel('Manhã (L)').fill('210,5');
    await sheet.getByRole('button', { name: 'Registrar total' }).click();
    await expect(page.getByTestId('game-action-sheet')).toHaveCount(0);
    await expect(page.getByTestId('game-tank')).toHaveAttribute('data-level', '1.00');
    const savedTotal = await page.evaluate(async () => {
      const state = await fetch('/api/game/state').then((response) => response.json()) as { today: { date: string } };
      const totals = await fetch('/api/daily-milk-totals').then((response) => response.json()) as Array<{ productionDate: string; herdGroupId: string | null; totalLiters: string }>;
      return totals.find((row) => row.productionDate === state.today.date && row.herdGroupId === null) ?? null;
    });
    expect(savedTotal?.totalLiters).toBe('210.50');
    // Streak de registro reflete o dia registrado.
    await expect(page.getByTestId('hud-streak')).toContainText(/seguido/);

    // 2) Coleta do laticínio → caminhão atravessa e o tanque baixa.
    await page.getByTestId('game-installation-mangueira').click();
    await page.getByTestId('game-action-sheet').getByRole('button', { name: /Registrar coleta do laticínio/ }).click();
    await page.getByTestId('game-action-sheet').getByLabel('Litros retirados').fill('150');
    await page.getByTestId('game-action-sheet').getByRole('button', { name: 'Registrar coleta' }).click();
    await expect(page.getByTestId('game-truck')).toHaveAttribute('data-state', 'driving');
    // (210,5 − 150) / 210,5 ≈ 0,29
    await expect(page.getByTestId('game-tank')).toHaveAttribute('data-level', '0.29');
    const savedCollection = await page.evaluate(async () => {
      const state = await fetch('/api/game/state').then((response) => response.json()) as { today: { date: string } };
      const collections = await fetch('/api/milk-collections').then((response) => response.json()) as Array<{ collectionDate: string; liters: string }>;
      return collections.find((row) => row.collectionDate === state.today.date) ?? null;
    });
    expect(savedCollection?.liters).toBe('150.00');

    // O fato aparece na tela de produção (prova visível de fato real).
    await page.goto('/producao');
    await expect(page.getByText(/210,5/).first()).toBeVisible();

    // 3) Duplicata do total diário mostra o erro REAL do endpoint na folha.
    await page.goto('/jogo');
    await page.getByTestId('game-installation-mangueira').click();
    await page.getByTestId('game-action-sheet').getByRole('button', { name: /Registrar produção do dia/ }).click();
    await page.getByTestId('game-action-sheet').getByLabel('Manhã (L)').fill('100');
    await page.getByTestId('game-action-sheet').getByRole('button', { name: 'Registrar total' }).click();
    await expect(page.getByTestId('game-action-sheet').getByText(/Já existe/)).toBeVisible();

    // 4) Economia do HUD bate com re-derivação independente das APIs cruas.
    const derived = await page.evaluate(async () => {
      const state = await fetch('/api/game/state').then((response) => response.json()) as { today: { date: string }; economy: { result: number | null; milkLiters: number } };
      const month = state.today.date.slice(0, 7);
      const [collections, purchases, priceSummary] = await Promise.all([
        fetch('/api/milk-collections').then((response) => response.json()) as Promise<Array<{ collectionDate: string; liters: string }>>,
        fetch('/api/purchases').then((response) => response.json()) as Promise<Array<{ purchaseDate: string; status: string; totalAmount: string }>>,
        fetch('/api/milk-prices').then((response) => response.json()) as Promise<Array<{ month: string; pricePerLiter: string }>>,
      ]);
      const liters = collections.filter((row) => row.collectionDate.startsWith(month)).reduce((sum, row) => sum + Number(row.liters), 0);
      const price = priceSummary.find((row) => row.month.startsWith(month)) ?? null;
      const spent = purchases.filter((row) => row.purchaseDate.startsWith(month) && row.status !== 'CANCELLED').reduce((sum, row) => sum + Number(row.totalAmount), 0);
      const expectedResult = price === null ? null : Math.round((Math.round(liters * 100) / 100 * Number(price.pricePerLiter) - spent) * 100) / 100;
      return { economy: state.economy, expectedLiters: Math.round(liters * 100) / 100, expectedResult };
    });
    expect(derived.economy.milkLiters).toBeCloseTo(derived.expectedLiters, 1);
    if (derived.expectedResult !== null) expect(derived.economy.result).toBeCloseTo(derived.expectedResult, 1);
    await expect(page.getByTestId('hud-economy')).toBeVisible();
  });
});

test.describe('jogo — endurecimento', () => {
  test('guarda de performance: clusters capados e DOM enxuto', async ({ page }) => {
    await login(page);
    await createGameMapFixture(page);
    await page.goto('/jogo');
    await expect(page.getByTestId('game-camera')).toBeVisible();
    const counts = await page.evaluate(() => {
      const svgNodes = document.querySelectorAll('[data-testid="game-root"] svg *').length;
      const cluster = document.querySelector('[data-testid^="herd-cluster-"]');
      return { svgNodes, clusterChildren: cluster ? cluster.childElementCount : 0 };
    });
    // Nós O(pastos), não O(animais): o seed tem ~80 vacas num lote e mesmo
    // assim o cluster desenha no máximo 8 sprites + 1 badge + 1 hit-area.
    expect(counts.svgNodes).toBeLessThan(1500);
    expect(counts.clusterChildren).toBeLessThanOrEqual(10);
  });

  test('prefers-reduced-motion desliga as animações do jogo', async ({ page }) => {
    await login(page);
    await createGameMapFixture(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/jogo');
    await expect(page.getByTestId('game-camera')).toBeVisible();
    // O Chrome normaliza tempos para segundos ("1e-05s"); comparamos numericamente.
    const durations = await page.evaluate(() => {
      const seconds = (value: string) => parseFloat(value) * (value.trim().endsWith('ms') ? 0.001 : 1);
      return {
        map: seconds(getComputedStyle(document.querySelector('.game-map')!).animationDuration),
        tank: seconds(getComputedStyle(document.querySelector('.game-tank-milk')!).transitionDuration),
      };
    });
    expect(durations.map).toBeLessThan(0.005);
    expect(durations.tank).toBeLessThan(0.005);
  });
});

test.describe('jogo — folha do lote', () => {
  test('clicar no rebanho abre a folha do lote com contagem real; cio registrado pela folha vira fato', async ({ page }) => {
    await login(page);
    const fixture = await createGameMapFixture(page);
    const linkedPasture = fixture.zones.find((zone) => zone.kind === 'PASTURE' && zone.herdGroupId);
    test.skip(!linkedPasture?.herdGroupId, 'fixture sem pasto vinculado a lote');
    const groupId = linkedPasture!.herdGroupId!;

    // Contagem esperada derivada de forma independente via /api/animals.
    const expected = await page.evaluate(async (id) => {
      const rows = await fetch('/api/animals').then((response) => response.json()) as Array<{ id: string; name: string | null; tagNumber: string | null; status: string; currentGroup: { id: string } | null }>;
      const members = rows.filter((row) => ['HEIFER', 'LACTATING', 'DRY'].includes(row.status) && row.currentGroup?.id === id);
      return { count: members.length, first: members[0] ?? null };
    }, groupId);
    test.skip(expected.count === 0, 'lote sem animais no seed');

    await page.goto('/jogo');
    await page.getByTestId(`herd-cluster-${groupId}`).click();
    const sheet = page.getByTestId('game-group-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(String(expected.count));
    await expect(sheet.getByTestId('game-group-animals').locator('button')).toHaveCount(expected.count);

    // Ações rápidas do primeiro animal.
    const animalId = expected.first!.id;
    await sheet.getByTestId(`game-group-animal-${animalId}`).click();
    await expect(sheet.getByTestId('game-group-animal-actions')).toBeVisible();
    await expect(sheet.getByRole('link', { name: /Editar ficha/ })).toHaveAttribute('href', `/rebanho/${animalId}`);

    // Registrar cio pela folha grava o fato real (visível depois na ficha).
    const before = await page.evaluate(async (id) => {
      const detail = await fetch(`/api/animals/${id}`).then((response) => response.json()) as { reproductiveEvents: Array<{ id: string }> };
      return detail.reproductiveEvents.length;
    }, animalId);
    await sheet.getByRole('button', { name: /Registrar cio\/cobertura/ }).click();
    await sheet.getByRole('button', { name: 'Salvar cio' }).click();
    await expect(sheet.getByTestId('game-group-animal-actions')).toBeVisible();
    const after = await page.evaluate(async (id) => {
      const detail = await fetch(`/api/animals/${id}`).then((response) => response.json()) as { reproductiveEvents: Array<{ id: string; occurredOn: string }> };
      return { count: detail.reproductiveEvents.length, latest: detail.reproductiveEvents[0] ?? null };
    }, animalId);
    expect(after.count).toBe(before + 1);

    // O fato aparece na ficha do animal (prova visível).
    await page.goto(`/rebanho/${animalId}`);
    await expect(page.getByText('Cio observado').first()).toBeVisible();

    // Limpeza: remove o cio criado para o spec ser idempotente.
    if (after.latest) {
      await page.evaluate(async ({ id, eventId }) => {
        await fetch(`/api/animals/${id}/reproductive-events/${eventId}`, { method: 'DELETE' });
      }, { id: animalId, eventId: after.latest.id });
    }

    // Acessibilidade: Esc fecha; Enter reabre pelo teclado.
    await page.goto('/jogo');
    await page.getByTestId(`herd-cluster-${groupId}`).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-group-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-group-sheet')).toHaveCount(0);
    await page.getByTestId(`herd-cluster-${groupId}`).focus();
    await page.keyboard.press(' ');
    await expect(page.getByTestId('game-group-sheet')).toBeVisible();
  });
});

test.describe('jogo — alimentação (Depósito e Estação)', () => {
  test('compra pelo Depósito credita o saldo; trato na Estação debita; além do saldo pede confirmação', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await login(page);
    await createGameMapFixture(page);
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const silageName = `Silagem e2e ${suffix}`;
    const mineralName = `Mineral e2e ${suffix}`;

    await page.goto('/jogo');

    // Depósito: novo item do catálogo.
    await page.getByTestId('game-installation-deposito').click();
    const deposito = page.getByTestId('game-deposito-sheet');
    await expect(deposito).toBeVisible();
    await deposito.getByRole('button', { name: /Novo item do catálogo/ }).click();
    await deposito.getByLabel('Nome do item').fill(silageName);
    await deposito.getByRole('button', { name: 'Salvar item' }).click();
    await expect(deposito.getByText(silageName)).toBeVisible();

    const silageId = await page.evaluate(async (name) => {
      const rows = await fetch('/api/feed-inventory').then((response) => response.json()) as Array<{ feedItemId: string; name: string; balance: number }>;
      return rows.find((row) => row.name === name)!.feedItemId;
    }, silageName);
    await expect(deposito.getByTestId(`feed-inventory-balance-${silageId}`)).toContainText('0 kg');

    // Compra de 3 t (vira 3.000 kg) por R$ 3.200 — compra REAL + entry.
    await deposito.getByRole('button', { name: /Registrar compra de alimento/ }).click();
    await deposito.getByLabel('Item do catálogo').selectOption({ label: silageName });
    await deposito.getByLabel('Quantidade comprada').fill('3');
    await deposito.getByLabel('Unidade digitada').selectOption('TONS');
    await deposito.getByLabel('Valor total').fill('3200,00');
    await deposito.getByRole('button', { name: 'Registrar compra de alimento' }).click();
    await expect(deposito.getByTestId(`feed-inventory-balance-${silageId}`)).toContainText('3.000 kg');

    // A compra financeira real existe com categoria FEED e a entry vinculada.
    const purchase = await page.evaluate(async (name) => {
      const [purchases, entries] = await Promise.all([
        fetch('/api/purchases').then((response) => response.json()) as Promise<Array<{ id: string; description: string; category: string; totalAmount: string }>>,
        fetch('/api/feed-purchase-entries').then((response) => response.json()) as Promise<Array<{ purchaseId: string; feedItemName: string; quantity: string }>>,
      ]);
      const found = purchases.find((row) => row.description === `Compra de ${name}`);
      return { found, entry: entries.find((entry) => entry.purchaseId === found?.id) ?? null };
    }, silageName);
    expect(purchase.found?.category).toBe('FEED');
    expect(purchase.found?.totalAmount).toBe('3200.00');
    expect(purchase.entry?.quantity).toBe('3000.000');

    // Segundo item (mineral) com compra de 100 kg, direto pela API (o fluxo de
    // UI já foi provado acima; aqui só precisamos do saldo).
    const mineralId = await page.evaluate(async (name) => {
      const item = await fetch('/api/feed-items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, canonicalUnit: 'KG' }) }).then((response) => response.json()) as { id: string };
      const created = await fetch('/api/purchases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purchaseDate: '2026-07-01', description: `Compra de ${name}`, category: 'FEED', totalAmount: 180 }) }).then((response) => response.json()) as { id: string };
      await fetch('/api/feed-purchase-entries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ feedItemId: item.id, purchaseId: created.id, quantity: 100 }) });
      return item.id;
    }, mineralName);

    // Estação: trato com 2 linhas (3 t → 500 kg silagem + 2 kg mineral).
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-deposito-sheet')).toHaveCount(0);
    await page.getByTestId('game-installation-estacao_alimentacao').click();
    const estacao = page.getByTestId('game-estacao-sheet');
    await expect(estacao).toBeVisible();
    await estacao.getByLabel('Item', { exact: true }).selectOption({ label: silageName });
    await expect(estacao.getByTestId('feed-line-balance-0')).toContainText('3.000 kg');
    await estacao.getByLabel('Quantidade', { exact: true }).fill('500');
    await estacao.getByRole('button', { name: 'Adicionar item' }).click();
    await estacao.getByLabel('Item 2', { exact: true }).selectOption({ label: mineralName });
    await estacao.getByLabel('Quantidade 2').fill('2');
    await estacao.getByRole('button', { name: 'Registrar trato' }).click();
    await expect(page.getByTestId('game-estacao-sheet')).toHaveCount(0);

    // Evento consultável via API: contexto STATION, 2 linhas; saldo baixa.
    const state = await page.evaluate(async ({ silage, mineral }) => {
      const [events, inventory] = await Promise.all([
        fetch('/api/feeding-events').then((response) => response.json()) as Promise<Array<{ context: string; items: Array<{ feedItemId: string; quantity: string }> }>>,
        fetch('/api/feed-inventory').then((response) => response.json()) as Promise<Array<{ feedItemId: string; balance: number }>>,
      ]);
      const event = events.find((row) => row.context === 'STATION' && row.items.some((item) => item.feedItemId === silage) && row.items.some((item) => item.feedItemId === mineral));
      return {
        event,
        silageBalance: inventory.find((row) => row.feedItemId === silage)?.balance,
        mineralBalance: inventory.find((row) => row.feedItemId === mineral)?.balance,
      };
    }, { silage: silageId, mineral: mineralId });
    expect(state.event?.items).toHaveLength(2);
    expect(state.silageBalance).toBe(2500);
    expect(state.mineralBalance).toBe(98);

    // Usar além do saldo → aviso com confirmação explícita (não bloqueia).
    await page.getByTestId('game-installation-estacao_alimentacao').click();
    await estacao.getByLabel('Item', { exact: true }).selectOption({ label: mineralName });
    await estacao.getByLabel('Quantidade', { exact: true }).fill('200');
    await estacao.getByRole('button', { name: 'Registrar trato' }).click();
    await expect(estacao.getByText(/acima do saldo/)).toBeVisible();
    await estacao.getByTestId('feeding-confirm-beyond').click();
    await expect(page.getByTestId('game-estacao-sheet')).toHaveCount(0);
    const mineralAfter = await page.evaluate(async (mineral) => {
      const inventory = await fetch('/api/feed-inventory').then((response) => response.json()) as Array<{ feedItemId: string; balance: number }>;
      return inventory.find((row) => row.feedItemId === mineral)?.balance;
    }, mineralId);
    expect(mineralAfter).toBe(-102);

    // Tudo persiste: recarregar e abrir o Depósito mostra o mesmo saldo.
    await page.reload();
    await page.getByTestId('game-installation-deposito').click();
    await expect(page.getByTestId('game-deposito-sheet').getByTestId(`feed-inventory-balance-${silageId}`)).toContainText('2.500 kg');

    // Garagem é decorativa: sprite presente, sem papel de botão.
    const garagemRole = await page.getByTestId('game-installation-garagem').getAttribute('role');
    expect(garagemRole).toBe('img');
  });
});

test.describe('jogo — trato da ordenha e tarefa do Hoje', () => {
  test('trato da ordenha pelo mapa grava evento MILKING com lote; tarefa "Trato do dia" muda de estado', async ({ page }, testInfo) => {
    await login(page);
    await createGameMapFixture(page);
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const itemName = `Ração e2e ${suffix}`;

    // Item com saldo, criado direto pela API (o fluxo de compra já tem e2e próprio).
    const itemId = await page.evaluate(async (name) => {
      const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const item = await fetch('/api/feed-items', json({ name, canonicalUnit: 'KG' })).then((response) => response.json()) as { id: string };
      const purchase = await fetch('/api/purchases', json({ purchaseDate: '2026-07-01', description: `Compra de ${name}`, category: 'FEED', totalAmount: 500 })).then((response) => response.json()) as { id: string };
      await fetch('/api/feed-purchase-entries', json({ feedItemId: item.id, purchaseId: purchase.id, quantity: 400 }));
      return item.id;
    }, itemName);

    // Limpa os tratos de HOJE para a tarefa do Hoje começar pendente.
    await page.evaluate(async () => {
      const dashboard = await fetch('/api/dashboard').then((response) => response.json()) as { date: string };
      const events = await fetch('/api/feeding-events').then((response) => response.json()) as Array<{ id: string; date: string }>;
      for (const event of events.filter((row) => row.date === dashboard.date)) {
        await fetch(`/api/feeding-events/${event.id}`, { method: 'DELETE' });
      }
    });

    await page.goto('/');
    await expect(page.getByTestId('daily-task-feeding')).toContainText('Pendente');

    // Trato da ordenha pela folha da mangueira, com lote leiteiro selecionado.
    await page.goto('/jogo');
    await page.getByTestId('game-installation-mangueira').click();
    const sheet = page.getByTestId('game-action-sheet');
    await sheet.getByRole('button', { name: /Registrar trato da ordenha/ }).click();
    const groupName = await sheet.getByLabel('Lote da ordenha').locator('option').nth(1).textContent();
    await sheet.getByLabel('Lote da ordenha').selectOption({ label: groupName! });
    await sheet.getByLabel('Item', { exact: true }).selectOption({ label: itemName });
    await sheet.getByLabel('Quantidade', { exact: true }).fill('100');
    await sheet.getByRole('button', { name: 'Registrar trato' }).click();
    await expect(page.getByTestId('game-action-sheet')).toHaveCount(0);

    // Evento MILKING com o lote correto, consultável via API.
    const saved = await page.evaluate(async (feedItemId) => {
      const dashboard = await fetch('/api/dashboard').then((response) => response.json()) as { date: string };
      const events = await fetch('/api/feeding-events').then((response) => response.json()) as Array<{ date: string; context: string; herdGroupName: string | null; items: Array<{ feedItemId: string; quantity: string }> }>;
      return events.find((row) => row.date === dashboard.date && row.context === 'MILKING' && row.items.some((item) => item.feedItemId === feedItemId)) ?? null;
    }, itemId);
    expect(saved?.herdGroupName).toBe(groupName);
    expect(saved?.items[0]?.quantity).toBe('100.000');

    // A tarefa do Hoje vira "Feito".
    await page.goto('/');
    await expect(page.getByTestId('daily-task-feeding')).toContainText('Feito');
  });
});

test.describe('jogo — chão de grama, cerca e limites da câmera', () => {
  test('perímetro gramado com mourões; zoom nunca sai do enquadramento e o pan trava nos limites', async ({ page }) => {
    await login(page);
    await createGameMapFixture(page);
    await page.goto('/jogo');

    // Cerca: grupo próprio com mourões equiespaçados (2 círculos por mourão).
    const fence = page.getByTestId('game-fence');
    await expect(fence).toBeVisible();
    const postCount = Number(await fence.getAttribute('data-post-count'));
    expect(postCount).toBeGreaterThan(8);
    await expect(fence.locator('circle')).toHaveCount(postCount * 2);

    // Chão do sítio renderiza como grama (gradiente próprio, não o "ground" cru).
    const perimeterFill = await page.evaluate(() => {
      const zone = document.querySelector('[data-testid^="game-zone-"]');
      return zone?.getAttribute('fill') ?? '';
    });
    expect(perimeterFill).toBe('url(#game-ground-grass)');

    const camera = page.getByTestId('game-camera');
    const parse = (transform: string | null) => {
      const match = transform?.match(/translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)/);
      return match ? { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) } : null;
    };

    // Enquadramento inteiro é o zoom mínimo: "Afastar" no início não muda nada.
    const initial = await camera.getAttribute('transform');
    expect(parse(initial)).toEqual({ x: 0, y: 0, scale: 1 });
    await page.getByRole('button', { name: 'Afastar' }).click();
    await expect(camera).toHaveAttribute('transform', initial!);

    // Ampliado, o pan alcança as bordas mas nunca sai do mapa (x,y ≤ 0 e
    // dentro do alcance da escala).
    await page.getByRole('button', { name: 'Aproximar' }).click();
    await page.getByRole('button', { name: 'Aproximar' }).click();
    const svg = page.locator('svg.game-map');
    const box = (await svg.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 5 });
    await page.mouse.up();
    const dragged = parse(await camera.getAttribute('transform'))!;
    expect(dragged.x).toBeLessThanOrEqual(0);
    expect(dragged.y).toBeLessThanOrEqual(0);

    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 5 });
    await page.mouse.up();
    const draggedBack = parse(await camera.getAttribute('transform'))!;
    const scale = draggedBack.scale;
    expect(draggedBack.x).toBeGreaterThanOrEqual(1000 - 1000 * scale - 0.01);
    expect(draggedBack.y).toBeLessThanOrEqual(0.01);

    await page.getByRole('button', { name: 'Centralizar' }).click();
    await expect(camera).toHaveAttribute('transform', initial!);
  });
});

test.describe('jogo — cercas dos pastos e contenção no perímetro', () => {
  test('pasto renderiza o traçado exato com cerca clara; nada nasce fora do perímetro', async ({ page }) => {
    await login(page);
    const fixture = await createGameMapFixture(page);
    await page.goto('/jogo');

    // Pasto: caminho segue EXATAMENTE os pontos do editor (sem Chaikin) e tem
    // a própria cerca clara com mourões.
    const pasture = fixture.zones.find((zone) => zone.kind === 'PASTURE')!;
    const path = page.locator(`path[data-testid="game-zone-${pasture.id}"]`);
    const d = (await path.getAttribute('d'))!;
    expect(d.match(/[ML]/g)!.length).toBe(pasture.ring.length);
    const pastureFence = page.getByTestId(`game-fence-pasture-${pasture.id}`);
    await expect(pastureFence).toBeVisible();
    expect(Number(await pastureFence.getAttribute('data-post-count'))).toBeGreaterThan(3);

    // Contenção: pasto e instalação fora do perímetro são recusados.
    const rejections = await page.evaluate(async () => {
      const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const farRing = [
        { lat: 10, lng: 10 }, { lat: 10, lng: 10.01 }, { lat: 10.01, lng: 10.01 },
      ];
      const zone = await fetch('/api/game/map/zones', json({ kind: 'PASTURE', name: 'Fora', ring: farRing }));
      const installation = await fetch('/api/game/map/installations', json({ kind: 'CASA', name: 'Casa', position: { lat: 10, lng: 10 } }));
      return {
        zone: { status: zone.status, code: (await zone.json()).error?.code as string },
        installation: { status: installation.status, code: (await installation.json()).error?.code as string },
      };
    });
    expect(rejections.zone).toEqual({ status: 400, code: 'PASTURE_OUTSIDE_PERIMETER' });
    expect(rejections.installation).toEqual({ status: 400, code: 'INSTALLATION_OUTSIDE_PERIMETER' });

    // Folha do Depósito: ações vêm ANTES da listagem de estoque.
    await page.getByTestId('game-installation-deposito').click();
    const sheet = page.getByTestId('game-deposito-sheet');
    await expect(sheet).toBeVisible();
    const order = await sheet.evaluate((element) => {
      const body = element.querySelector('.game-sheet-body')!;
      const action = [...body.querySelectorAll('button.game-sheet-action')].find((node) => node.textContent?.includes('Registrar compra de alimento'))!;
      const list = body.querySelector('[data-testid="feed-inventory-list"]')!;
      return Boolean(action.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
  });
});
