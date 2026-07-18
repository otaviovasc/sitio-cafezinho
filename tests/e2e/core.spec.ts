import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe.configure({ mode: 'serial' });

test('fluxos centrais do sítio', async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('Senha', { exact: true }).fill('senha-incorreta');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Senha incorreta.')).toBeVisible();
  await page.getByLabel('Senha', { exact: true }).fill(process.env.APP_PASSWORD ?? 'senha-local-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  const operationDate = await page.evaluate(async () => (await fetch('/api/dashboard').then((response) => response.json()) as { date: string }).date);
  await expect(page.getByText('Visão mensal')).toBeVisible();
  await expect(page.getByText('Resumo de hoje')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ações rápidas' })).toBeVisible();
  for (const action of ['Controle individual', 'Registrar pesos', 'Cadastrar animal', 'Registrar entrada', 'Registrar saída', 'Enviar documento', 'Consultar animal', 'Produção e coletas', 'Casos de mastite', 'Fornecedores', 'Preço do leite', 'Exportar dados']) {
    await expect(page.getByRole('link', { name: new RegExp(action) }).first()).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });

  await page.goto('/rebanho');
  await page.getByLabel('Buscar').fill('Caruja');
  await page.locator('a[aria-label="Abrir histórico de Caruja"]:visible').click();
  await expect(page.getByRole('heading', { name: 'Caruja' })).toBeVisible();

  await page.goto('/producao');
  await page.getByRole('link', { name: /Controle leiteiro — manhã \+ tarde/ }).click();
  await expect(page.getByText(/^(724,5|737,5) L$/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Excluir', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Confirmar exclusão?' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('modal-confirmacao.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Confirmar exclusão?' })).toBeHidden();
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
  await page.getByRole('button', { name: 'Salvar animal' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Revise os campos destacados' })).toBeFocused();
  await expect(page.getByText('Informe o nome ou o número do brinco.')).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill(cowName);
  await expect(page.getByText('Informe o nome ou o número do brinco.')).toBeHidden();
  await page.getByRole('button', { name: 'Salvar animal' }).click();
  await expect(page.getByText('Animal cadastrado', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: cowName })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar para Rebanho' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('toast-e-voltar.png') });
  await expect(page.getByText('Animal cadastrado', { exact: true })).toBeHidden({ timeout: 3_000 });
  await expect(page.getByText('Em lactação', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Lote 1', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar período seco' }).click();
  await page.getByLabel('Data da mudança').fill(operationDate);
  await page.getByLabel('Motivo ou observação').fill('Início da seca de teste');
  await page.getByRole('button', { name: 'Registrar mudança' }).click();
  await expect(page.getByText('Seca', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Início da seca de teste')).toBeVisible();
  await expect(page.getByText('Fora da lactação', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Registrar parto' }).click();
  await page.getByLabel('Data da mudança').fill(operationDate);
  await page.getByLabel('Motivo ou observação').fill('Retorno à lactação de teste');
  await page.getByRole('button', { name: 'Registrar parto e iniciar lactação' }).click();
  await expect(page.getByText('Em lactação', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Registrar cio', exact: true }).click();
  await page.getByRole('button', { name: 'Sim' }).click();
  await page.getByLabel('Touro (opcional)').fill('Touro teste');
  await page.getByRole('button', { name: 'Salvar cio' }).click();
  await expect(page.getByText('Cio com cobertura')).toBeVisible();
  await expect(page.getByText('Aguardando confirmação', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mudar lote' }).first().click();
  await page.getByLabel('Novo lote de ordenha').selectOption({ label: 'Lote 2' });
  await page.getByLabel('Data da mudança').fill(operationDate);
  await page.getByRole('button', { name: 'Registrar mudança' }).click();
  await expect(page.getByText('Lote 2', { exact: true }).first()).toBeVisible();

  const alias = `Alias ${suffix}`;
  await page.getByRole('button', { name: 'Gerenciar aliases' }).click();
  await expect(page.getByRole('dialog', { name: 'Aliases do caderno' })).toBeVisible();
  await page.getByLabel('Novo alias').fill(alias);
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByRole('dialog').getByText(alias, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/rebanho/novo');
  await page.getByRole('button', { name: 'Vários animais' }).click();
  await page.getByLabel('Lista de animais').fill(`Novilha A ${suffix}; 8${Date.now().toString().slice(-5)}\nNovilha B ${suffix}`);
  await page.getByRole('button', { name: /Cadastrar 2 animal/ }).click();
  await expect(page.getByRole('heading', { name: `Novilha A ${suffix}` })).toBeVisible();

  // Pesagem manual (sem chave): registra somente os animais realmente pesados.
  const weightDate = testInfo.project.name === 'desktop-1440' ? '2026-07-09' : '2026-07-10';
  await page.evaluate(async (date) => {
    const sessions = await fetch('/api/weight-sessions').then((response) => response.json()) as Array<{ id: string; measuredOn: string }>;
    const existing = sessions.find((session) => session.measuredOn === date);
    if (existing) await fetch(`/api/weight-sessions/${existing.id}`, { method: 'DELETE' });
  }, weightDate);
  await page.goto('/pesos/novo');
  await page.getByLabel('Data da pesagem').fill(weightDate);
  await page.getByLabel('Buscar animal').fill(cowName);
  await page.getByLabel(`Peso de ${cowName}`).fill('486');
  await page.getByRole('button', { name: /^Salvar pesagem/ }).click();
  await expect(page.getByRole('heading', { name: 'Pesagem do rebanho' })).toBeVisible();
  await expect(page.getByText('486 kg', { exact: true }).first()).toBeVisible();

  // Controle individual manual (sem chave): preenche todas as vacas em lactação na data.
  const manualControlDate = testInfo.project.name === 'desktop-1440' ? '2026-07-13' : '2026-07-14';
  await page.evaluate(async (date) => {
    const sessions = await fetch('/api/milk-sessions').then((response) => response.json()) as Array<{ id: string; sessionDate: string }>;
    for (const existing of sessions.filter((session) => session.sessionDate === date)) await fetch(`/api/milk-sessions/${existing.id}`, { method: 'DELETE' });
  }, manualControlDate);
  await page.goto('/producao/individual/novo');
  await page.getByLabel('Data do controle').fill(manualControlDate);
  await expect(page.getByRole('heading', { name: /Vacas em lactação/ })).toBeVisible();
  const decimalInputs = page.locator('.scroll-area input[inputmode="decimal"]:not([disabled])');
  const inputCount = await decimalInputs.count();
  expect(inputCount).toBeGreaterThan(0);
  for (let index = 0; index < inputCount; index++) await decimalInputs.nth(index).fill('9');
  await page.getByRole('button', { name: /^Salvar controle/ }).click();
  await expect(page).toHaveURL(/\/producao\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: new RegExp(`Controle de ${manualControlDate.split('-').reverse().join('/')}`) })).toBeVisible();

  // Revisão de transcrição (caminho do Assistente/OCR): criada via API e revisada no detalhe.
  const importDate = testInfo.project.name === 'desktop-1440' ? '2026-07-11' : '2026-07-12';
  const correctedImportDate = testInfo.project.name === 'desktop-1440' ? '2026-07-10' : '2026-07-11';
  const registeredSessionId = await page.evaluate(async ({ importDate, correctedImportDate, label }) => {
    const sessions = await fetch('/api/milk-sessions').then((response) => response.json()) as Array<{ id: string; sessionDate: string }>;
    for (const existing of sessions.filter((session) => [importDate, correctedImportDate].includes(session.sessionDate))) await fetch(`/api/milk-sessions/${existing.id}`, { method: 'DELETE' });
    const response = await fetch('/api/import/milk-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionDate: importDate, inputMode: 'SEPARATE_MORNING_AFTERNOON', measurements: [
        { rawAnimalLabel: label, rawValueText: '10 + 8,5', morningLiters: 10, afternoonLiters: 8.5, totalLiters: 18.5, confidence: 'HIGH', status: 'NEEDS_REVIEW', animalId: null, notes: null },
        { rawAnimalLabel: '[rótulo ilegível]', rawValueText: null, morningLiters: null, afternoonLiters: null, totalLiters: null, confidence: 'LOW', status: 'EXCLUDED', animalId: null, notes: 'Linha riscada no caderno; sem valor legível' },
      ] }),
    });
    return ((await response.json()) as { id: string }).id;
  }, { importDate, correctedImportDate, label: `Vaca importada ${suffix}` });
  await page.goto(`/producao/${registeredSessionId}`);
  await expect(page.getByRole('heading', { name: 'Controle importado' })).toBeVisible();
  await expect(page.getByText('[rótulo ilegível]', { exact: true })).toBeVisible();
  await expect(page.getByText('Sem valor legível', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await page.getByLabel('Data do controle').fill(correctedImportDate);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText(`${correctedImportDate.split('-').reverse().join('/')} · Importado`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cadastrar sem vínculo (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Cadastrar animais sem vínculo' })).toBeVisible();
  await page.getByLabel('Lote inicial dos animais selecionados').selectOption({ label: 'Lote 1' });
  await expect(page.getByText(`Vaca importada ${suffix}`, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Cadastrar e vincular 1 animal' }).click();
  await expect(page.getByRole('button', { name: /Cadastrar sem vínculo/ })).toHaveCount(0);
  await expect(page.getByText('Sem vínculo com um animal.')).toHaveCount(0);
  const registeredFromControl = await page.evaluate(async (name) => {
    const [animals, session] = await Promise.all([
      fetch('/api/animals').then((response) => response.json()) as Promise<Array<{ id: string; name: string | null; status: string; currentGroup: { name: string } | null }>>,
      fetch(location.pathname.replace('/producao/', '/api/milk-sessions/')).then((response) => response.json()) as Promise<{ sessionDate: string; measurements: Array<{ rawAnimalLabel: string; animalId: string | null }> }>,
    ]);
    const animal = animals.find((item) => item.name === name);
    const measurement = session.measurements.find((item) => item.rawAnimalLabel === name);
    const detail = animal ? await fetch(`/api/animals/${animal.id}`).then((response) => response.json()) as { groupHistory: Array<{ startedOn: string }>; statusHistory: Array<{ changedOn: string }> } : null;
    return { date: session.sessionDate, status: animal?.status, group: animal?.currentGroup?.name, groupStarted: detail?.groupHistory[0]?.startedOn, statusChanged: detail?.statusHistory[0]?.changedOn, linked: measurement?.animalId === animal?.id };
  }, `Vaca importada ${suffix}`);
  expect(registeredFromControl).toEqual({ date: correctedImportDate, status: 'LACTATING', group: 'Lote 1', groupStarted: correctedImportDate, statusChanged: correctedImportDate, linked: true });

  const registeredAnimalId = await page.evaluate(async (name) => {
    const animals = await fetch('/api/animals').then((response) => response.json()) as Array<{ id: string; name: string | null }>;
    return animals.find((animal) => animal.name === name)?.id;
  }, `Vaca importada ${suffix}`);
  expect(registeredAnimalId).toBeTruthy();
  await page.goto(`/rebanho/${registeredAnimalId}`);
  await page.getByRole('button', { name: 'Excluir animal', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Excluir animal e seus controles?' })).toContainText('1 controle individual');
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir animal', exact: true }).click();
  await expect(page).toHaveURL(/\/rebanho$/);
  await expect(page.getByText('Animal excluído', { exact: true })).toBeVisible();
  const deletionFacts = await page.evaluate(async ({ animalId, sessionId, label }) => {
    const [animalResponse, sessionResponse] = await Promise.all([fetch(`/api/animals/${animalId}`), fetch(`/api/milk-sessions/${sessionId}`)]);
    const session = await sessionResponse.json() as { measurements: Array<{ rawAnimalLabel: string }> };
    return { animalStatus: animalResponse.status, sessionStatus: sessionResponse.status, measurementStillExists: session.measurements.some((row) => row.rawAnimalLabel === label) };
  }, { animalId: registeredAnimalId, sessionId: registeredSessionId, label: `Vaca importada ${suffix}` });
  expect(deletionFacts).toEqual({ animalStatus: 404, sessionStatus: 200, measurementStillExists: false });

  await page.evaluate(async () => {
    const rows = await fetch('/api/daily-milk-totals').then((response) => response.json()) as Array<{ id: string; productionDate: string }>;
    for (const existing of rows.filter((row) => row.productionDate === '2026-05-06')) await fetch(`/api/daily-milk-totals/${existing.id}`, { method: 'DELETE' });
  });
  // Criação do total diário agora é a página dedicada (sem formulário fixo no /producao).
  await page.goto('/producao/total/novo');
  await page.getByLabel('Data', { exact: true }).fill('2026-05-06');
  await page.getByLabel('Manhã (L)').fill('210.00');
  await expect(page.getByLabel('Manhã (L)')).toHaveValue('210,00');
  await page.getByLabel('Tarde (L)').fill('175');
  await page.getByRole('button', { name: 'Registrar total' }).click();
  await expect(page).toHaveURL(/\/producao$/);
  await expect(page.getByText('385 L', { exact: true }).first()).toBeVisible();

  await page.goto('/producao/total/novo');
  await page.getByLabel('Data', { exact: true }).fill('2026-05-06');
  await page.getByLabel('Produção de').selectOption({ label: 'Lote 1' });
  await page.getByLabel('Manhã (L)').fill('120');
  await page.getByLabel('Tarde (L)').fill('80');
  await page.getByRole('button', { name: 'Registrar total' }).click();
  await expect(page).toHaveURL(/\/producao$/);
  await expect(page.getByText('Lote: Lote 1', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('200 L', { exact: true }).first()).toBeVisible();

  await page.goto('/producao/total/novo');
  await page.getByLabel('Data', { exact: true }).fill('2026-05-06');
  await page.getByLabel('Produção de').selectOption({ label: 'Lote 2' });
  await expect(page.getByLabel('Tarde (L)')).toBeDisabled();
  await page.getByLabel('Manhã (L)').fill('95');
  await page.getByRole('button', { name: 'Registrar total' }).click();
  await expect(page).toHaveURL(/\/producao$/);
  await expect(page.getByText('Lote: Lote 2', { exact: true }).first()).toBeVisible();

  await page.goto('/producao/total/novo');
  await page.getByLabel('Data', { exact: true }).fill('2026-05-06');
  await page.getByLabel('Produção de').selectOption({ label: 'Lote 2' });
  await page.getByLabel('Manhã (L)').fill('96');
  await page.getByRole('button', { name: 'Registrar total' }).click();
  await expect(page.getByText(/Já existe produção da manhã nesta data/)).toBeVisible();

  await page.evaluate(async () => {
    const rows = await fetch('/api/milk-collections').then((response) => response.json()) as Array<{ id: string; collectionDate: string }>;
    for (const row of rows.filter((item) => item.collectionDate === '2026-05-06')) await fetch(`/api/milk-collections/${row.id}`, { method: 'DELETE' });
  });
  await page.goto('/producao/coletas/nova');
  await page.getByLabel('Data', { exact: true }).fill('2026-05-06');
  await page.getByLabel('Litros retirados').fill('360');
  await page.getByRole('button', { name: 'Registrar coleta' }).click();
  await expect(page.getByRole('heading', { name: 'Coleta de 06/05/2026' })).toBeVisible();
  await expect(page.getByText(/Produção agregada registrada/)).toBeVisible();
  await expect(page.getByText(/Coleta registrada/).first()).toBeVisible();
  await expect(page.getByText(/Diferença observada/)).toBeVisible();
  const milkFacts = await page.evaluate(async () => {
    const [daily, sessions, collections] = await Promise.all([
      fetch('/api/daily-milk-totals').then((response) => response.json()) as Promise<Array<{ productionDate: string; herdGroupId: string | null; herdGroupName: string | null; morningLiters: string | null; afternoonLiters: string | null; totalLiters: string }>>,
      fetch('/api/milk-sessions').then((response) => response.json()) as Promise<Array<{ sessionDate: string }>>,
      fetch('/api/milk-collections').then((response) => response.json()) as Promise<Array<{ collectionDate: string; liters: string }>>,
    ]);
    const dayRows = daily.filter((row) => row.productionDate === '2026-05-06');
    return {
      overall: dayRows.find((row) => row.herdGroupId === null)?.totalLiters,
      lot: dayRows.find((row) => row.herdGroupName === 'Lote 1')?.totalLiters,
      morningOnlyLot: dayRows.find((row) => row.herdGroupName === 'Lote 2'),
      session: sessions.some((row) => row.sessionDate === '2026-05-06'),
      collection: collections.find((row) => row.collectionDate === '2026-05-06')?.liters,
    };
  });
  expect(milkFacts).toEqual({
    overall: '385.00',
    lot: '200.00',
    morningOnlyLot: expect.objectContaining({ morningLiters: '95.00', afternoonLiters: null, totalLiters: '95.00' }),
    session: true,
    collection: '360.00',
  });

  await page.goto('/mastite/nova');
  await page.getByLabel('Animal').selectOption({ label: cowName });
  await page.getByLabel('Sinal percebido ou observação').fill('Grumos observados no teste automatizado');
  await page.getByText('Mais detalhes', { exact: true }).click();
  await page.getByLabel('Carência informada até').fill('2026-07-18');
  await page.getByLabel('Descarte de leite informado').check();
  await page.getByRole('button', { name: 'Abrir caso de mastite' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Mastite — ${cowName}`) })).toBeVisible();
  await expect(page.getByText(/Carência informada até 18\/07\/2026/)).toBeVisible();
  await page.getByLabel('Data da ação').fill(operationDate);
  await page.getByLabel('Ação informada').fill('Reavaliar leite no teste');
  await page.getByRole('button', { name: 'Adicionar ação' }).click();
  await expect(page.getByText('Reavaliar leite no teste')).toBeVisible();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText('Realizada', { exact: true })).toBeVisible();

  await page.goto('/receitas/nova');
  await expect(page.getByRole('link', { name: /Entrada Venda ou receita/ })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: testInfo.outputPath('nova-entrada.png'), fullPage: true });
  await page.getByLabel('Descrição').fill(`Venda de leite ${suffix}`);
  await page.getByLabel('Valor da entrada').fill('1250.50');
  await expect(page.getByLabel('Valor da entrada')).toHaveValue('1250,50');
  await page.getByRole('radio', { name: /Já recebi/ }).check();
  await page.getByLabel('Categoria').selectOption('MILK_SALE');
  await page.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(page.getByText('R$ 1.250,50')).toBeVisible();

  const saleAnimalName = `Animal venda ${suffix}`;
  await page.goto('/rebanho/novo');
  await page.getByLabel('Nome', { exact: true }).fill(saleAnimalName);
  await page.getByRole('button', { name: 'Salvar animal' }).click();
  await expect(page.getByRole('heading', { name: saleAnimalName })).toBeVisible();
  const saleAnimalId = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Registrar saída' }).click();
  await page.getByLabel('Motivo ou observação').fill('Venda automatizada de teste');
  await page.getByLabel('Motivo', { exact: true }).fill('Venda de cria');
  await page.getByLabel('Valor recebido').fill('1850');
  await page.getByLabel('Valor recebido').blur();
  await expect(page.getByLabel('Valor recebido')).toHaveValue('1850,00');
  await page.getByLabel('Criar receita de venda de animal').check();
  await page.getByRole('button', { name: 'Registrar mudança' }).click();
  await expect(page.getByText('Vendida', { exact: true }).first()).toBeVisible();
  const saleFacts = await page.evaluate(async (animalId) => fetch(`/api/animals/${animalId}`).then((response) => response.json()) as Promise<{ exits: unknown[]; revenues: unknown[] }>, saleAnimalId);
  expect(saleFacts.exits).toHaveLength(1);
  expect(saleFacts.revenues).toHaveLength(1);

  const deadAnimalName = `Animal morte ${suffix}`;
  await page.goto('/rebanho/novo');
  await page.getByLabel('Nome', { exact: true }).fill(deadAnimalName);
  await page.getByRole('button', { name: 'Salvar animal' }).click();
  await expect(page.getByRole('heading', { name: deadAnimalName })).toBeVisible();
  const deadAnimalId = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Alterar situação' }).click();
  await page.getByLabel('Nova situação').selectOption('DEAD');
  await page.getByLabel('Motivo', { exact: true }).fill('Ocorrência automatizada de teste');
  await page.getByLabel('Motivo ou observação').fill('Morte registrada somente para validar o fluxo');
  await page.getByRole('button', { name: 'Registrar mudança' }).click();
  await expect(page.getByText('Morta', { exact: true }).first()).toBeVisible();
  const deathFacts = await page.evaluate(async (animalId) => fetch(`/api/animals/${animalId}`).then((response) => response.json()) as Promise<{ exits: unknown[]; revenues: unknown[] }>, deadAnimalId);
  expect(deathFacts.exits).toHaveLength(1);
  expect(deathFacts.revenues).toHaveLength(0);

  // Garante o fornecedor usado abaixo mesmo sem dados demonstrativos (seed só do caderno).
  await page.evaluate(async () => {
    const suppliers = await fetch('/api/suppliers').then((response) => response.json()) as Array<{ name: string }>;
    if (!suppliers.some((supplier) => supplier.name === 'Raca forte')) {
      await fetch('/api/suppliers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Raca forte' }) });
    }
  });
  await page.goto('/compras/nova');
  await expect(page.getByRole('link', { name: /Saída Compra ou despesa/ })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: testInfo.outputPath('nova-saida.png'), fullPage: true });
  const purchaseName = `Ração teste ${suffix}`;
  await page.getByLabel('Descrição').fill(purchaseName);
  await page.getByLabel('Valor total da saída').fill('7340,14');
  await expect(page.getByRole('radio', { name: /Pagar depois/ })).toBeChecked();
  await page.getByRole('radio', { name: /Já paguei/ }).check();
  await expect(page.getByLabel('Vencimento (opcional)')).toHaveCount(0);
  await page.getByRole('radio', { name: /Pagar depois/ }).check();
  await page.getByLabel('Fornecedor').selectOption({ label: 'Raca forte' });
  await page.getByRole('button', { name: 'Registrar saída' }).click();
  await expect(page.getByText(/7\.340,14/).first()).toBeVisible();
  await expect(page.getByText('A pagar', { exact: true })).toBeVisible();
  const filename = `comprovante-${suffix}.pdf`;
  await page.getByLabel('Arquivo').setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n${suffix}\n%%EOF`) });
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(filename)).toBeVisible();
  await page.goto('/documentos');
  await expect(page.getByText(filename)).toBeVisible();

  await page.goto('/financeiro');
  await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Registrar entrada/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Registrar saída/ })).toBeVisible();
  await expect(page.getByText('Resultado de caixa registrado', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('financeiro.png'), fullPage: true });

  await page.goto('/financeiro/preco-leite');
  await expect(page.getByRole('heading', { name: 'Preço do leite' })).toBeVisible();
  await page.getByLabel('Mês', { exact: true }).fill('2026-05');
  await page.getByLabel('Preço por litro').fill('1,85');
  await page.getByLabel('Observação (opcional)').fill('Preço mensal do teste automatizado');
  await page.getByRole('button', { name: /Salvar (preço|alteração)/ }).click();
  await expect(page.getByText(/Preço do leite (registrado|atualizado)/)).toBeVisible();
  await expect(page.getByText('R$ 666,00', { exact: true })).toBeVisible();
  await page.getByLabel('Preço por litro').fill('1,90');
  await page.getByRole('button', { name: 'Salvar alteração' }).click();
  await expect(page.getByText('Preço do leite atualizado', { exact: true })).toBeVisible();
  await expect(page.getByText('Preço do leite atualizado', { exact: true })).toHaveCount(1);
  await expect(page.getByText('R$ 684,00', { exact: true })).toBeVisible();
  const milkPriceSummary = await page.evaluate(async () => fetch('/api/milk-prices/summary?month=2026-05').then((response) => response.json()) as Promise<{ collection: { collectedLiters: number; pricePerLiter: number; estimatedValue: number } }>);
  expect(milkPriceSummary.collection).toEqual(expect.objectContaining({ collectedLiters: 360, pricePerLiter: 1.9, estimatedValue: 684 }));
  await page.screenshot({ path: testInfo.outputPath('preco-leite.png'), fullPage: true });

  await page.goto('/configuracoes/dados');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Baixar CSV' }).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});

test('abre e atualiza um preço mensal pelo histórico', async ({ page }) => {
  await login(page);
  await page.evaluate(async () => {
    await fetch('/api/milk-prices/2026-09', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pricePerLiter: 1.83, notes: 'Preço para testar edição pelo histórico' }),
    });
  });
  await page.goto('/financeiro/preco-leite');
  await page.getByLabel('Mês', { exact: true }).fill('2026-08');
  await page.getByRole('button', { name: /Editar preço de setembro de 2026/i }).click();
  await expect(page.getByLabel('Mês', { exact: true })).toHaveValue('2026-09');
  await expect(page.getByLabel('Preço por litro')).toHaveValue('1,83');
  await page.getByLabel('Preço por litro').fill('1,84');
  await page.getByRole('button', { name: 'Salvar alteração' }).click();
  await expect(page.getByText('Preço do leite atualizado', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => fetch('/api/milk-prices/summary?month=2026-09').then((response) => response.json()) as Promise<{ price: { pricePerLiter: string } }>);
  expect(saved.price.pricePerLiter).toBe('1.8400');
});

test('rebanho abre por lotes, com contagem e pasto recalculados via API', async ({ page }) => {
  await login(page);
  await page.goto('/rebanho');

  // Contagens e pastos esperados derivados de forma independente das APIs.
  const expected = await page.evaluate(async () => {
    const [animals, groups, map] = await Promise.all([
      fetch('/api/animals').then((response) => response.json()) as Promise<Array<{ status: string; currentGroup: { id: string } | null }>>,
      fetch('/api/herd-groups').then((response) => response.json()) as Promise<Array<{ id: string; name: string; active: boolean }>>,
      fetch('/api/game/map').then((response) => response.json()) as Promise<{ zones: Array<{ kind: string; name: string; herdGroupId: string | null }> }>,
    ]);
    const alive = new Set(['HEIFER', 'LACTATING', 'DRY']);
    return {
      groups: groups.filter((group) => group.active).map((group) => ({
        id: group.id,
        name: group.name,
        count: animals.filter((animal) => animal.currentGroup?.id === group.id).length,
        pasture: map.zones.find((zone) => zone.kind === 'PASTURE' && zone.herdGroupId === group.id)?.name ?? null,
      })),
      unassigned: animals.filter((animal) => alive.has(animal.status) && !animal.currentGroup).length,
    };
  });

  for (const group of expected.groups) {
    const card = page.getByTestId(`herd-group-card-${group.id}`);
    await expect(card).toBeVisible();
    await expect(page.getByTestId(`herd-group-count-${group.id}`)).toContainText(String(group.count));
    if (group.pasture) await expect(page.getByTestId(`herd-group-pasture-${group.id}`)).toContainText(group.pasture);
    else await expect(page.getByTestId(`herd-group-pasture-${group.id}`)).toContainText('Sem pasto no mapa');
  }
  await expect(page.getByTestId('herd-group-card-sem-lote')).toHaveCount(expected.unassigned > 0 ? 1 : 0);

  // Navegação lote → animais: a lista mostra exatamente os animais do lote.
  const firstWithAnimals = expected.groups.find((group) => group.count > 0);
  if (firstWithAnimals) {
    await page.getByTestId(`herd-group-card-${firstWithAnimals.id}`).click();
    await expect(page).toHaveURL(new RegExp(`/rebanho/lote/${firstWithAnimals.id}$`));
    await expect(page.getByRole('heading', { name: firstWithAnimals.name })).toBeVisible();
    await expect(page.getByTestId('herd-group-animals').locator('a[aria-label^="Abrir histórico de"]:visible')).toHaveCount(firstWithAnimals.count);
    // A linha continua levando ao detalhe do animal.
    await page.getByTestId('herd-group-animals').locator('a[aria-label^="Abrir histórico de"]:visible').first().click();
    await expect(page).toHaveURL(/\/rebanho\/[0-9a-f-]{36}$/);
  }

  // Busca genuína na tela inicial continua revelando animais direto.
  await page.goto('/rebanho');
  await page.getByLabel('Buscar').fill('Caruja');
  await expect(page.locator('a[aria-label="Abrir histórico de Caruja"]:visible')).toBeVisible();
});
