import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('upload image switches to image mode and translates', async () => {
  const { app, page } = await launchApp();
  await page.getByText('设置').click();
  await page.getByText('更换 key').click();
  await page.getByPlaceholder('粘贴 Gemini API key').fill('k');
  await page.getByRole('button', { name: '保存' }).first().click();
  await page.getByText('翻译').click();
  await page.getByRole('tab', { name: '图片' }).click();
  const fixture = path.join(__dirname, 'fixture.png');
  if (!fs.existsSync(fixture)) fs.writeFileSync(fixture, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('image-dropzone').click(),
  ]);
  await chooser.setFiles(fixture);
  await page.locator('main').getByRole('button', { name: /翻译/ }).click();
  await expect(page.getByText('hello world')).toBeVisible({ timeout: 10000 });
  await app.close();
});
