// Screenshots de QA visual do Caderno (mobile + desktop). Uso:
//   pnpm tsx scripts/qa-screenshots.ts <baseURL> <outDir> <tag>
// Ex.: node --env-file=.env ./node_modules/.bin/tsx scripts/qa-screenshots.ts http://localhost:3000 /tmp/caderno-qa depois
import { chromium, type Page } from '@playwright/test';

const [baseURL, outDir, tag] = process.argv.slice(2);
if (!baseURL || !outDir || !tag) {
  console.error('uso: tsx scripts/qa-screenshots.ts <baseURL> <outDir> <tag>');
  process.exit(1);
}

const password = process.env.APP_PASSWORD ?? 'senha-local-segura';

async function login(page: Page) {
  await page.goto(baseURL);
  const label = page.getByLabel('Senha', { exact: true });
  const needsLogin = await label.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  if (needsLogin) {
    await label.fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();
  }
  await page.waitForSelector('[data-testid="game-root"]', { timeout: 20000 });
}

async function openNotebook(page: Page, tabTestId: string) {
  await page.goto(`${baseURL}/?caderno=1`);
  await page.waitForSelector('[data-testid="game-notebook"]', { timeout: 20000 });
  await page.getByTestId(tabTestId).click();
  await page.waitForTimeout(1200);
}

const scenarios = [
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

const browser = await chromium.launch();
for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: scenario.viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await login(page);

  await openNotebook(page, 'game-notebook-tab-hoje');
  await page.screenshot({ path: `${outDir}/${tag}-${scenario.name}-hoje.png` });

  // Rola o corpo do caderno: o conteúdo deve rolar sem encavalar header/abas.
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${tag}-${scenario.name}-hoje-scroll.png` });

  await openNotebook(page, 'game-notebook-tab-producao');
  await page.screenshot({ path: `${outDir}/${tag}-${scenario.name}-producao.png` });

  const filter = page.getByTestId('game-notebook-producao-filter-coletas');
  await filter.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${tag}-${scenario.name}-producao-filtro-coletas.png` });

  await openNotebook(page, 'game-notebook-tab-estoque');
  await page.screenshot({ path: `${outDir}/${tag}-${scenario.name}-estoque.png` });

  await openNotebook(page, 'game-notebook-tab-financeiro');
  await page.screenshot({ path: `${outDir}/${tag}-${scenario.name}-financeiro.png` });

  await openNotebook(page, 'game-notebook-tab-saude');
  await page.screenshot({ path: `${outDir}/${tag}-${scenario.name}-saude.png` });

  await openNotebook(page, 'game-notebook-tab-rebanho');
  await page.screenshot({ path: `${outDir}/${tag}-${scenario.name}-rebanho.png` });

  await context.close();
}
await browser.close();
console.log(`screenshots em ${outDir}`);
