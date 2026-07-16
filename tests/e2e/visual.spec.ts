import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

async function capturePaintedViewport(page: Page, path: string) {
  await page.screenshot({ fullPage: true, animations: 'disabled' });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}

async function captureCurrentViewport(page: Page, path: string) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
}

async function captureTallPage(page: Page, path: string) {
  const viewport = page.viewportSize();
  if (!viewport) return;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  await page.setViewportSize(viewport);
}

test('captura estados principais sem rolagem horizontal', async ({ page }, testInfo) => {
  await login(page);
  const routes = [
    ['dashboard', '/'],
    ['producao', '/producao'],
    ['rebanho', '/rebanho'],
    ['pesos', '/pesos'],
    ['compras', '/compras'],
    ['documentos', '/documentos'],
    ['registrar-coleta', '/producao/coletas/nova'],
    ['mastite', '/mastite'],
    ['nova-receita', '/receitas/nova'],
    ['nova-compra', '/compras/nova'],
    ['financeiro', '/financeiro'],
    ['preco-leite', '/financeiro/preco-leite'],
    ['exportacao-dados', '/configuracoes/dados'],
  ] as const;
  for (const [name, route] of routes) {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(layout.scrollWidth > layout.clientWidth, `${route} não deve ter rolagem horizontal: ${JSON.stringify(layout)}`).toBe(false);
    await capturePaintedViewport(page, testInfo.outputPath(`${name}.png`));
  }

  await page.goto('/producao');
  await page.getByLabel('Produção de').selectOption({ label: 'Lote 2' });
  await page.getByLabel('Manhã (L)').fill('210,5');
  await expect(page.getByLabel('Tarde (L)')).toBeDisabled();
  await expect(page.getByText('Este lote possui ordenha somente pela manhã.')).toBeVisible();
  await capturePaintedViewport(page, testInfo.outputPath('producao-lote-so-manha.png'));

  const ids = await page.evaluate(async () => {
    const [animals, sessions] = await Promise.all([
      fetch('/api/animals').then((response) => response.json()) as Promise<Array<{ id: string; name: string | null }>>,
      fetch('/api/milk-sessions').then((response) => response.json()) as Promise<Array<{ id: string; sessionDate: string }>>,
    ]);
    return { animalId: animals.find((animal) => animal.name === 'Caruja')?.id, sessionId: sessions.find((session) => session.sessionDate === '2026-05-06')?.id };
  });
  if (ids.animalId) {
    await page.goto(`/rebanho/${ids.animalId}`);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Caruja' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureTallPage(page, testInfo.outputPath('animal-detalhe.png'));
  }
  if (ids.sessionId) {
    await page.goto(`/producao/${ids.sessionId}`);
    await page.reload();
    await page.getByText('Medições', { exact: true }).scrollIntoViewIfNeeded();
    await capturePaintedViewport(page, testInfo.outputPath('controle-revisao.png'));
  }

  await page.goto('/pesos/importar');
  await page.getByRole('button', { name: 'Carregar exemplo' }).click();
  await page.getByRole('button', { name: 'Validar pesagens' }).click();
  await expect(page.getByText('3. Revisar antes de salvar')).toBeVisible();
  await page.getByText('3. Revisar antes de salvar').scrollIntoViewIfNeeded();
  await capturePaintedViewport(page, testInfo.outputPath('peso-revisao.png'));

  await page.goto('/producao/importar');
  await page.getByLabel('JSON retornado pelo ChatGPT').fill('{');
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await expect(page.getByText('O conteúdo não é um JSON válido.')).toBeVisible();
  await capturePaintedViewport(page, testInfo.outputPath('importacao-validacao.png'));

  await page.getByRole('button', { name: 'Carregar exemplo' }).click();
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await expect(page.getByText('3. Revisar o controle')).toBeVisible();
  await page.getByText('3. Revisar o controle').scrollIntoViewIfNeeded();
  await capturePaintedViewport(page, testInfo.outputPath('importacao-revisao.png'));

  const bulkRegistrationDate = testInfo.project.name === 'mobile-360' ? '2026-07-13' : '2026-07-14';
  const bulkSessionId = await page.evaluate(async (date) => {
    const sessions = await fetch('/api/milk-sessions').then((response) => response.json()) as Array<{ id: string; sessionDate: string }>;
    const existing = sessions.find((session) => session.sessionDate === date);
    if (existing) await fetch(`/api/milk-sessions/${existing.id}`, { method: 'DELETE' });
    const response = await fetch('/api/import/chatgpt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionDate: date, inputMode: 'SEPARATE_MORNING_AFTERNOON', title: 'Revisão visual do cadastro em massa', measurements: [{ rawAnimalLabel: `Vaca visual ${date}`, rawValueText: '10 + 8', morningLiters: 10, afternoonLiters: 8, totalLiters: 18, confidence: 'HIGH', status: 'NEEDS_REVIEW', animalId: null, notes: 'Dado demonstrativo do teste visual.' }] }),
    });
    return ((await response.json()) as { id: string }).id;
  }, bulkRegistrationDate);
  await page.goto(`/producao/${bulkSessionId}`);
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await expect(page.getByLabel('Data do controle')).toHaveValue(bulkRegistrationDate);
  await captureCurrentViewport(page, testInfo.outputPath('edicao-data-controle.png'));
  await page.getByRole('button', { name: 'Cancelar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cadastrar sem vínculo (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Cadastrar animais sem vínculo' })).toBeVisible();
  await captureCurrentViewport(page, testInfo.outputPath('cadastro-em-massa-controle.png'));

  await page.goto('/receitas/nova');
  await page.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Revise os campos destacados' })).toBeFocused();
  await expect(page.getByText('Descreva de onde vem esta entrada.')).toBeVisible();
  await expect(page.getByText('Informe um valor maior que zero.')).toBeVisible();
  await capturePaintedViewport(page, testInfo.outputPath('entrada-validacao.png'));

  await page.goto('/compras/nova');
  await page.getByRole('button', { name: 'Registrar saída' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Revise os campos destacados' })).toBeFocused();
  await expect(page.getByText('Descreva o que foi comprado ou pago.')).toBeVisible();
  await expect(page.getByText('Informe um valor maior que zero.')).toBeVisible();
  await capturePaintedViewport(page, testInfo.outputPath('saida-validacao.png'));

  await page.goto('/producao/coletas/nova');
  await page.getByLabel('Litros retirados').fill('360.50');
  await expect(page.getByLabel('Litros retirados')).toHaveValue('360,50');
  await page.getByLabel('Litros retirados').fill('');
  await page.getByRole('button', { name: 'Registrar coleta' }).click();
  await expect(page.getByText('Informe um volume maior que zero.')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Revise os campos destacados' })).toBeFocused();
  await capturePaintedViewport(page, testInfo.outputPath('coleta-validacao.png'));

  await page.goto('/financeiro/preco-leite');
  await page.getByRole('button', { name: /Editar preço de julho de 2026/i }).click();
  await expect(page.getByLabel('Mês', { exact: true })).toHaveValue('2026-07');
  await expect(page.getByLabel('Preço por litro')).toHaveValue(/1,7/);
  await capturePaintedViewport(page, testInfo.outputPath('preco-leite-edicao-historico.png'));
  await page.getByLabel('Mês', { exact: true }).fill('2199-12');
  await expect(page.getByText('Não informado', { exact: true })).toBeVisible();
  await expect(page.getByText('0 L', { exact: true }).first()).toBeVisible();
  await capturePaintedViewport(page, testInfo.outputPath('preco-leite-vazio.png'));
  await page.getByRole('button', { name: 'Salvar preço' }).click();
  await expect(page.getByText('Informe um preço maior que zero.')).toBeVisible();
  await capturePaintedViewport(page, testInfo.outputPath('preco-leite-validacao.png'));

  await page.route((url) => url.pathname === '/api/milk-prices/summary', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Falha simulada ao carregar o resumo.' } }) });
  });
  await page.reload();
  await expect(page.getByText('Falha simulada ao carregar o resumo.')).toBeVisible();
  await capturePaintedViewport(page, testInfo.outputPath('preco-leite-erro.png'));
  await page.unroute((url) => url.pathname === '/api/milk-prices/summary');
});
