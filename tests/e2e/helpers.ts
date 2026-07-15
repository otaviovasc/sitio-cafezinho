import { expect, type Page } from '@playwright/test';

export async function login(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.APP_PASSWORD ?? 'senha-local-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
}
