import { globalShortcut } from 'electron';

export function registerGlobalShortcut(accelerator: string, action: () => void): boolean {
  globalShortcut.unregisterAll();
  if (!accelerator) return false;
  return globalShortcut.register(accelerator, action);
}
