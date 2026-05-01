import { app, BrowserWindow, nativeTheme, clipboard } from 'electron';
import { createMainWindow } from './window';
import { registerSettingsIpc } from './ipc/settings';
import { registerHistoryIpc, startupCleanup } from './ipc/history';
import { registerTranslateIpc } from './ipc/translate';
import { loadSettings } from './services/secret-store';
import { createTray } from './tray';
import { registerGlobalShortcut } from './shortcuts';

let mainWindow: BrowserWindow | null = null;

function showMain(): void {
  if (!mainWindow) mainWindow = createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
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

  mainWindow = createMainWindow();
  createTray(() => mainWindow, quickTranslateClipboard);

  registerGlobalShortcut(loadSettings().shortcut, showMain);

  nativeTheme.on('updated', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('theme:system-changed', { isDark: nativeTheme.shouldUseDarkColors });
    }
  });
});

app.on('window-all-closed', () => { /* keep alive in tray — intentionally no quit */ });
app.on('before-quit', () => { (app as unknown as { isQuitting: boolean }).isQuitting = true; });
