import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  TranslateRunPayload, TranslateChunkEvent, TranslateDoneEvent, TranslateErrorEvent,
  Settings, HistoryListQuery, HistoryRecord, HistoryAssetReadResult,
} from '../shared/types';

const api = {
  translate: {
    run: (p: TranslateRunPayload): Promise<{ accepted: true }> =>
      ipcRenderer.invoke('translate:run', p),
    cancel: (id: string): Promise<{ cancelled: boolean }> =>
      ipcRenderer.invoke('translate:cancel', { id }),
    onChunk: (cb: (e: TranslateChunkEvent) => void) => {
      const wrap = (_: IpcRendererEvent, ev: TranslateChunkEvent) => cb(ev);
      ipcRenderer.on('translate:chunk', wrap);
      return () => ipcRenderer.off('translate:chunk', wrap);
    },
    onDone: (cb: (e: TranslateDoneEvent) => void) => {
      const wrap = (_: IpcRendererEvent, ev: TranslateDoneEvent) => cb(ev);
      ipcRenderer.on('translate:done', wrap);
      return () => ipcRenderer.off('translate:done', wrap);
    },
    onError: (cb: (e: TranslateErrorEvent) => void) => {
      const wrap = (_: IpcRendererEvent, ev: TranslateErrorEvent) => cb(ev);
      ipcRenderer.on('translate:error', wrap);
      return () => ipcRenderer.off('translate:error', wrap);
    },
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
  },
  history: {
    list: (q: HistoryListQuery = {}): Promise<HistoryRecord[]> => ipcRenderer.invoke('history:list', q),
    delete: (id: string) => ipcRenderer.invoke('history:delete', { id }),
    clear: () => ipcRenderer.invoke('history:clear'),
    favorite: (id: string, favorite: boolean) => ipcRenderer.invoke('history:favorite', { id, favorite }),
    readAsset: (id: string): Promise<HistoryAssetReadResult | null> =>
      ipcRenderer.invoke('history:read-asset', { id }),
  },
  theme: {
    onSystemChanged: (cb: (e: { isDark: boolean }) => void) => {
      const wrap = (_: IpcRendererEvent, ev: { isDark: boolean }) => cb(ev);
      ipcRenderer.on('theme:system-changed', wrap);
      return () => ipcRenderer.off('theme:system-changed', wrap);
    },
  },
  log: {
    warn: (msg: string) => ipcRenderer.send('log:warn', msg),
    error: (msg: string) => ipcRenderer.send('log:error', msg),
  },
  app: {
    openLogDir: () => ipcRenderer.invoke('app:open-log-dir'),
    showWindow: () => ipcRenderer.invoke('app:show-window'),
    onFocusInput: (cb: () => void) => {
      const wrap = () => cb();
      ipcRenderer.on('app:focus-input', wrap);
      return () => ipcRenderer.off('app:focus-input', wrap);
    },
    onQuickTranslate: (cb: (e: { text: string }) => void) => {
      const wrap = (_: IpcRendererEvent, ev: { text: string }) => cb(ev);
      ipcRenderer.on('app:quick-translate', wrap);
      return () => ipcRenderer.off('app:quick-translate', wrap);
    },
  },
};

contextBridge.exposeInMainWorld('electron', api);
export type ElectronApi = typeof api;
