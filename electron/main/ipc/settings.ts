import { app, ipcMain, shell, BrowserWindow } from 'electron';
import path from 'node:path';
import { loadSettings, saveSettings } from '../services/secret-store';
import type { Settings } from '@shared/types';

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => { saveSettings(patch); return loadSettings(); });
  ipcMain.handle('app:open-log-dir', () => {
    void shell.openPath(path.join(app.getPath('userData'), 'logs'));
    return { ok: true };
  });
  ipcMain.handle('app:show-window', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
    return { ok: true };
  });
}
