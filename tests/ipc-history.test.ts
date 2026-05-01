import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
      __invoke: (ch: string, payload?: unknown) => handlers.get(ch)!({}, payload),
    },
    app: { getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'llmiph-')) },
  };
});

describe('history IPC', () => {
  beforeEach(() => vi.resetModules());

  it('list/insert/delete/clear/setFavorite round trip', async () => {
    const { registerHistoryIpc, __recordForTests } = await import('../electron/main/ipc/history');
    const { ipcMain } = await import('electron') as unknown as { ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> } };
    registerHistoryIpc();

    __recordForTests({ id: 'a', createdAt: 1, mode: 'text', sourceLang: 'zh', targetLang: 'en', sourceText: 'x', resultText: 'y', assetPath: null, favorite: false, tokenUsage: null });
    expect(((await ipcMain.__invoke('history:list', {})) as Array<{ id: string }>).map((r) => r.id)).toEqual(['a']);

    await ipcMain.__invoke('history:favorite', { id: 'a', favorite: true });
    expect(((await ipcMain.__invoke('history:list', { favoritesOnly: true })) as Array<{ id: string }>).map((r) => r.id)).toEqual(['a']);

    await ipcMain.__invoke('history:delete', { id: 'a' });
    expect(await ipcMain.__invoke('history:list', {})).toEqual([]);
  });
});
