import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

export function createTray(getMainWindow: () => BrowserWindow | null, onTranslateClipboard: () => void): Tray {
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  function showMain() {
    const w = getMainWindow();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }

  tray.on('click', showMain);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗', click: showMain },
    { label: '快速翻译剪贴板', click: onTranslateClipboard },
    { type: 'separator' },
    { label: '退出', click: () => { (app as unknown as { isQuitting: boolean }).isQuitting = true; app.quit(); } },
  ]));
  tray.setToolTip('llmTranslate');
  return tray;
}
