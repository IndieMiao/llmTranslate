import { app, BrowserWindow, nativeTheme, clipboard, ipcMain } from 'electron';
import { createMainWindow } from './window';
import { registerSettingsIpc } from './ipc/settings';
import { registerHistoryIpc, startupCleanup } from './ipc/history';
import { registerTranslateIpc } from './ipc/translate';
import { loadSettings } from './services/secret-store';
import { createTray } from './tray';
import { registerGlobalShortcut } from './shortcuts';
import { initLogger, logger } from './logger';

initLogger();

let mainWindow: BrowserWindow | null = null;

function showMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) {
    mainWindow.show();
    // force to foreground on Windows after hide()
    mainWindow.setAlwaysOnTop(true);
    setTimeout(() => mainWindow?.setAlwaysOnTop(false), 100);
  }
  mainWindow.focus();
  mainWindow.webContents.send('app:focus-input', {});
}

function quickTranslateClipboard(): void {
  const text = clipboard.readText();
  if (!text) return;
  showMain();
  mainWindow?.webContents.send('app:quick-translate', { text });
}

app.whenReady().then(() => {
  registerSettingsIpc();
  registerHistoryIpc();
  registerTranslateIpc();
  startupCleanup(loadSettings().history.maxRecords);

  ipcMain.on('log:warn', (_e, msg: string) => logger.warn('[renderer]', msg));
  ipcMain.on('log:error', (_e, msg: string) => logger.error('[renderer]', msg));

  mainWindow = createMainWindow();
  createTray(showMain, quickTranslateClipboard);

  registerGlobalShortcut(loadSettings().shortcut, showMain);

  nativeTheme.on('updated', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('theme:system-changed', { isDark: nativeTheme.shouldUseDarkColors });
    }
  });
});

app.on('window-all-closed', () => { /* keep alive in tray — intentionally no quit */ });
app.on('before-quit', () => { (app as unknown as { isQuitting: boolean }).isQuitting = true; });
