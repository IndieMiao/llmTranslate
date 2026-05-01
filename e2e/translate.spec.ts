import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';

test('first-run set api key, translate text, history populated', async () => {
  const { app, page } = await launchApp();
  await page.getByText('设置').click();
  await page.getByText('更换 key').click();
  await page.getByPlaceholder('粘贴 Gemini API key').fill('test-key');
  await page.getByRole('button', { name: '保存' }).first().click();
  await page.getByText('翻译').click();
  await page.getByPlaceholder(/输入要翻译的文字/).fill('你好');
  await page.locator('main').getByRole('button', { name: /翻译/ }).click();
  await expect(page.getByText('hello world')).toBeVisible({ timeout: 10000 });
  await page.getByText('历史').click();
  await expect(page.getByText('你好').first()).toBeVisible();
  await app.close();
});

test('language switch reverses direction', async () => {
  const { app, page } = await launchApp();
  await page.getByText('设置').click();
  await page.getByText('更换 key').click();
  await page.getByPlaceholder('粘贴 Gemini API key').fill('k');
  await page.getByRole('button', { name: '保存' }).first().click();
  await page.getByText('翻译').click();
  // Wait for the translate page to render the LangSwitch button (async settings load)
  await page.waitForTimeout(1000);
  const button = page.locator('main').getByRole('button').filter({ hasText: /→/ });
  await button.click();
  await expect(page.locator('main').getByRole('button').filter({ hasText: /→/ })).toContainText('英');
  await app.close();
});
