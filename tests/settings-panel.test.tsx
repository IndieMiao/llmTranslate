import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import type { Settings } from '@shared/types';

const baseSettings: Settings = {
  apiKey: 'sk-test-1234',
  model: 'gemini-2.5-flash',
  theme: 'system',
  shortcut: 'Ctrl+Shift+T',
  languagePair: 'zh-en',
  history: { maxRecords: 200 },
};

let current: Settings;
const settingsGet = vi.fn(async () => current);
const settingsSet = vi.fn(async (patch: Partial<Settings>) => {
  current = { ...current, ...patch } as Settings;
  return current;
});
const openLogDir = vi.fn();

beforeEach(() => {
  current = { ...baseSettings };
  settingsGet.mockClear();
  settingsSet.mockClear();
  openLogDir.mockClear();
  Object.assign(window, {
    electron: {
      settings: { get: settingsGet, set: settingsSet },
      app: { openLogDir },
    },
  });
});

async function renderPanel(over: Partial<Settings> = {}) {
  current = { ...baseSettings, ...over };
  render(<SettingsPanel />);
  await screen.findByLabelText('模型');
}

describe('SettingsPanel — model selector', () => {
  it('preselects a curated saved model', async () => {
    await renderPanel({ model: 'gemini-2.5-flash' });
    const select = screen.getByLabelText('模型') as HTMLSelectElement;
    expect(select.value).toBe('gemini-2.5-flash');
    expect(screen.queryByTestId('model-custom-input')).toBeNull();
  });

  it('switching to a curated option calls settings.set', async () => {
    await renderPanel({ model: 'gemini-2.5-flash' });
    const select = screen.getByLabelText('模型');
    await userEvent.selectOptions(select, 'gemini-2.5-pro');
    await waitFor(() =>
      expect(settingsSet).toHaveBeenCalledWith({ model: 'gemini-2.5-pro' }),
    );
  });

  it('non-curated saved model shows 自定义 with the value in the input', async () => {
    await renderPanel({ model: 'gemini-1.5-pro' });
    const select = screen.getByLabelText('模型') as HTMLSelectElement;
    expect(select.value).toBe('__custom__');
    const input = screen.getByTestId('model-custom-input') as HTMLInputElement;
    expect(input.value).toBe('gemini-1.5-pro');
  });

  it('picking 自定义 reveals the input and does not call settings.set', async () => {
    await renderPanel({ model: 'gemini-2.5-flash' });
    const select = screen.getByLabelText('模型');
    await userEvent.selectOptions(select, '__custom__');
    const input = screen.getByTestId('model-custom-input') as HTMLInputElement;
    expect(input.value).toBe('gemini-2.5-flash');
    expect(settingsSet).not.toHaveBeenCalled();
  });

  it('保存 button is disabled when custom input is empty', async () => {
    await renderPanel({ model: 'gemini-1.5-pro' });
    const input = screen.getByTestId('model-custom-input') as HTMLInputElement;
    await userEvent.clear(input);
    const saveBtn = screen.getByTestId('model-custom-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('saving non-empty custom input calls settings.set with trimmed value', async () => {
    await renderPanel({ model: 'gemini-2.5-flash' });
    await userEvent.selectOptions(screen.getByLabelText('模型'), '__custom__');
    const input = screen.getByTestId('model-custom-input');
    await userEvent.clear(input);
    await userEvent.type(input, '  gemini-foo  ');
    await userEvent.click(screen.getByTestId('model-custom-save'));
    await waitFor(() =>
      expect(settingsSet).toHaveBeenCalledWith({ model: 'gemini-foo' }),
    );
  });
});
