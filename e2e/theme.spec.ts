import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';

test('theme dark / light updates data-theme', async () => {
  const { app, page } = await launchApp();
  await page.getByText('设置').click();
  await page.getByRole('button', { name: '亮色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '暗色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await app.close();
});
