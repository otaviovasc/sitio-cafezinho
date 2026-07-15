import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('fluxos centrais do sítio', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('Senha', { exact: true }).fill('senha-incorreta');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Senha incorreta.')).toBeVisible();
  await page.getByLabel('Senha', { exact: true }).fill(process.env.APP_PASSWORD ?? 'senha-local-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Início' })).toBeVisible();
  await expect(page.getByText('Visão do mês')).toBeVisible();
  await expect(page.getByText('Rebanho e lotes')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });

  await page.goto('/rebanho');
  await page.getByLabel('Buscar').fill('Caruja');
  await page.locator('a[aria-label="Abrir histórico de Caruja"]:visible').click();
  await expect(page.getByRole('heading', { name: 'Caruja' })).toBeVisible();

  await page.goto('/producao');
  await page.getByRole('link', { name: /Controle leiteiro — manhã \+ tarde/ }).click();
  await expect(page.getByText(/^(724,5|737,5) L$/).first()).toBeVisible();
  const confirmPending = page.getByRole('button', { name: 'Confirmar linha 512 13???', exact: true });
  if (await confirmPending.count()) {
    await confirmPending.scrollIntoViewIfNeeded();
    const response = page.waitForResponse((candidate) => candidate.url().includes('/api/milk-measurements/') && candidate.request().method() === 'PATCH');
    await confirmPending.click();
    expect((await response).ok()).toBeTruthy();
  }
  await expect(page.getByText('737,5 L', { exact: true }).first()).toBeVisible();

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const cowName = `Vaca ciclo ${suffix}`;
  await page.goto('/rebanho/novo');
  await page.getByLabel('Nome', { exact: true }).fill(cowName);
  await page.getByRole('button', { name: 'Salvar animal' }).click();
  await expect(page.getByRole('heading', { name: cowName })).toBeVisible();
  await expect(page.getByText('Em lactação', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Lote 1', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar período seco' }).click();
  await page.getByLabel('Data da mudança').fill('2026-07-15');
  await page.getByLabel('Motivo ou observação').fill('Início da seca de teste');
  await page.getByRole('button', { name: 'Registrar mudança' }).click();
  await expect(page.getByText('Seca', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Início da seca de teste')).toBeVisible();
  await expect(page.getByText('Fora da lactação', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Registrar parto' }).click();
  await page.getByLabel('Data da mudança').fill('2026-07-15');
  await page.getByLabel('Motivo ou observação').fill('Retorno à lactação de teste');
  await page.getByRole('button', { name: 'Registrar parto e iniciar lactação' }).click();
  await expect(page.getByText('Em lactação', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Registrar cio' }).click();
  await page.getByRole('button', { name: 'Sim' }).click();
  await page.getByLabel('Touro (opcional)').fill('Touro teste');
  await page.getByRole('button', { name: 'Salvar cio' }).click();
  await expect(page.getByText('Cio com cobertura')).toBeVisible();
  await expect(page.getByText('Aguardando confirmação', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mudar lote' }).click();
  await page.getByLabel('Novo lote de ordenha').selectOption({ label: 'Lote 2' });
  await page.getByLabel('Data da mudança').fill('2026-07-15');
  await page.getByRole('button', { name: 'Registrar mudança' }).click();
  await expect(page.getByText('Lote 2', { exact: true }).first()).toBeVisible();

  const alias = `Alias ${suffix}`;
  await page.getByLabel('Novo alias').fill(alias);
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText(alias, { exact: true })).toBeVisible();

  await page.goto('/rebanho/novo');
  await page.getByRole('button', { name: 'Vários animais' }).click();
  await page.getByLabel('Lista de animais').fill(`Novilha A ${suffix}; 8${Date.now().toString().slice(-5)}\nNovilha B ${suffix}`);
  await page.getByRole('button', { name: /Cadastrar 2 animal/ }).click();
  await expect(page.getByRole('heading', { name: `Novilha A ${suffix}` })).toBeVisible();

  const weightDate = testInfo.project.name === 'desktop-1440' ? '2026-07-09' : '2026-07-10';
  await page.goto('/pesos/importar');
  await page.evaluate(async (date) => {
    const sessions = await fetch('/api/weight-sessions').then((response) => response.json()) as Array<{ id: string; measuredOn: string }>;
    const existing = sessions.find((session) => session.measuredOn === date);
    if (existing) await fetch(`/api/weight-sessions/${existing.id}`, { method: 'DELETE' });
  }, weightDate);
  const weightJson = { measuredOn: weightDate, measurements: [{ rawAnimalLabel: cowName, rawValueText: '486', weightKg: 486, confidence: 'HIGH', excluded: false, notes: null }] };
  await page.getByLabel('JSON retornado pelo ChatGPT').fill(JSON.stringify(weightJson));
  await page.getByRole('button', { name: 'Validar pesagens' }).click();
  await expect(page.getByText('Dados carregados. Corrija as inconsistências destacadas.')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar 1 linha(s)' }).click();
  await expect(page.getByRole('heading', { name: 'Pesagem do rebanho' })).toBeVisible();
  await expect(page.getByText('486 kg', { exact: true }).first()).toBeVisible();

  await page.goto('/producao/importar');
  await page.getByLabel('Data da sessão').fill('2026-07-11');
  await page.getByRole('button', { name: 'Carregar exemplo' }).click();
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await expect(page.getByText(/O controle ainda está incompleto/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar controle revisado' })).toBeDisabled();

  await page.goto('/producao');
  await page.evaluate(async () => {
    const rows = await fetch('/api/daily-milk-totals').then((response) => response.json()) as Array<{ id: string; productionDate: string }>;
    const existing = rows.find((row) => row.productionDate === '2026-07-15');
    if (existing) await fetch(`/api/daily-milk-totals/${existing.id}`, { method: 'DELETE' });
  });
  await page.reload();
  await page.getByLabel('Data', { exact: true }).fill('2026-07-15');
  await page.getByLabel('Manhã (L)').fill('410,5');
  await page.getByLabel('Tarde (L)').fill('300');
  await page.getByRole('button', { name: 'Registrar total' }).click();
  await expect(page.getByText('710,5 L', { exact: true })).toBeVisible();

  await page.goto('/compras/nova');
  const purchaseName = `Ração teste ${suffix}`;
  await page.getByLabel('Descrição').fill(purchaseName);
  await page.getByLabel('Valor total').fill('7340,14');
  await page.getByText('Mais detalhes', { exact: true }).click();
  await page.getByLabel('Fornecedor').selectOption({ label: 'Raca forte' });
  await page.getByRole('button', { name: 'Salvar compra' }).click();
  await expect(page.getByText(/7\.340,14/).first()).toBeVisible();
  const filename = `comprovante-${suffix}.pdf`;
  await page.getByLabel('Arquivo').setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n${suffix}\n%%EOF`) });
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(filename)).toBeVisible();
  await page.goto('/documentos');
  await expect(page.getByText(filename)).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});
