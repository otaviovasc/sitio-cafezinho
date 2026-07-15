import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

async function capturePaintedViewport(page: Page, path: string) {
  await page.screenshot({ fullPage: false, animations: 'disabled' });
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
});
