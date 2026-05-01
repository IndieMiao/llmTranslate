import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';
import { registerSettingsIpc } from './ipc/settings';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  registerSettingsIpc();
  mainWindow = createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
});
