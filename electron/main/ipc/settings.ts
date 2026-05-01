import { ipcMain } from 'electron';
import { loadSettings, saveSettings } from '../services/secret-store';
import type { Settings } from '@shared/types';

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    saveSettings(patch);
    return loadSettings();
  });
}
