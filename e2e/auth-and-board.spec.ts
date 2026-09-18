import { expect, test } from '@playwright/test';

const username = process.env.E2E_ADMIN_USERNAME ?? 'admin';
const password = process.env.E2E_ADMIN_PASSWORD ?? 'change-me-admin-password';

test('admin can sign in and reach board', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole('region', { name: 'Board filters' })).toBeVisible();
});
