import { app, BrowserWindow, nativeTheme } from 'electron';
import { createMainWindow } from './window';
import { registerSettingsIpc } from './ipc/settings';
import { registerHistoryIpc, startupCleanup } from './ipc/history';
import { registerTranslateIpc } from './ipc/translate';
import { loadSettings } from './services/secret-store';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  registerSettingsIpc();
  registerHistoryIpc();
  registerTranslateIpc();
  startupCleanup(loadSettings().history.maxRecords);

  mainWindow = createMainWindow();

  nativeTheme.on('updated', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('theme:system-changed', { isDark: nativeTheme.shouldUseDarkColors });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
});
