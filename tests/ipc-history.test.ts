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
    const { ipcMain } = (await import('electron')) as unknown as {
      ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> };
    };
    registerHistoryIpc();

    __recordForTests({
      id: 'a', createdAt: 1, mode: 'text', sourceLang: 'zh', targetLang: 'en',
      sourceText: 'x', resultText: 'y', assetPath: null, favorite: false, tokenUsage: null,
    });
    expect(((await ipcMain.__invoke('history:list', {})) as Array<{ id: string }>).map((r) => r.id)).toEqual(['a']);

    await ipcMain.__invoke('history:favorite', { id: 'a', favorite: true });
    expect(
      ((await ipcMain.__invoke('history:list', { favoritesOnly: true })) as Array<{ id: string }>).map((r) => r.id),
    ).toEqual(['a']);

    await ipcMain.__invoke('history:delete', { id: 'a' });
    expect(await ipcMain.__invoke('history:list', {})).toEqual([]);
  });

  it('read-asset returns dataUrl for a record inside asset dir', async () => {
    const mod = await import('../electron/main/ipc/history');
    const { ipcMain } = (await import('electron')) as unknown as {
      ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> };
    };
    mod.registerHistoryIpc();

    const assetDir = mod.getAssetDir();
    const subDir = path.join(assetDir, '2026', '05');
    fs.mkdirSync(subDir, { recursive: true });
    const filePath = path.join(subDir, 'r1.png');
    fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    mod.__recordForTests({
      id: 'r1', createdAt: 1, mode: 'image', sourceLang: 'zh', targetLang: 'en',
      sourceText: null, resultText: 'hello', assetPath: filePath, favorite: false, tokenUsage: null,
    });

    const res = (await ipcMain.__invoke('history:read-asset', { id: 'r1' })) as
      | { mime: string; dataUrl: string }
      | null;
    expect(res).not.toBeNull();
    expect(res!.mime).toBe('image/png');
    expect(res!.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('read-asset returns null when the file is missing on disk', async () => {
    const mod = await import('../electron/main/ipc/history');
    const { ipcMain } = (await import('electron')) as unknown as {
      ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> };
    };
    mod.registerHistoryIpc();

    const assetDir = mod.getAssetDir();
    const filePath = path.join(assetDir, '2026', '05', 'gone.png');
    mod.__recordForTests({
      id: 'r2', createdAt: 1, mode: 'image', sourceLang: 'zh', targetLang: 'en',
      sourceText: null, resultText: 'hello', assetPath: filePath, favorite: false, tokenUsage: null,
    });

    const res = await ipcMain.__invoke('history:read-asset', { id: 'r2' });
    expect(res).toBeNull();
  });

  it('read-asset refuses paths outside the asset dir', async () => {
    const mod = await import('../electron/main/ipc/history');
    const { ipcMain } = (await import('electron')) as unknown as {
      ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> };
    };
    mod.registerHistoryIpc();

    const evilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evil-'));
    const evilPath = path.join(evilDir, 'secret.png');
    fs.writeFileSync(evilPath, Buffer.from([1, 2, 3]));

    mod.__recordForTests({
      id: 'r3', createdAt: 1, mode: 'image', sourceLang: 'zh', targetLang: 'en',
      sourceText: null, resultText: 'hello', assetPath: evilPath, favorite: false, tokenUsage: null,
    });

    const res = await ipcMain.__invoke('history:read-asset', { id: 'r3' });
    expect(res).toBeNull();
  });

  it('read-asset returns null for records with no asset', async () => {
    const mod = await import('../electron/main/ipc/history');
    const { ipcMain } = (await import('electron')) as unknown as {
      ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> };
    };
    mod.registerHistoryIpc();

    mod.__recordForTests({
      id: 'r4', createdAt: 1, mode: 'text', sourceLang: 'zh', targetLang: 'en',
      sourceText: 'x', resultText: 'y', assetPath: null, favorite: false, tokenUsage: null,
    });

    const res = await ipcMain.__invoke('history:read-asset', { id: 'r4' });
    expect(res).toBeNull();
  });
});
