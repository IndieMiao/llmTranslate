import { BrowserWindow, nativeTheme } from 'electron';
import path from 'node:path';
import { app } from 'electron';

export function createMainWindow(): BrowserWindow {
  // dist-electron/index.js lives one level below the project root when built by vite-plugin-electron.
  // __dirname is injected at bundle time as the directory containing index.js (dist-electron/).
  const distElectron = __dirname;
  const preloadPath = path.join(distElectron, 'preload.js');

  const win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 720, minHeight: 520,
    show: false, frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e1116' : '#ffffff',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  });

  if (process.env['VITE_DEV_SERVER_URL']) void win.loadURL(process.env['VITE_DEV_SERVER_URL']);
  else void win.loadFile(path.join(distElectron, '..', 'dist', 'index.html'));

  win.once('ready-to-show', () => win.show());

  win.on('close', (e) => {
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  return win;
}
