import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
      __invoke: (ch: string, payload: unknown) => handlers.get(ch)!({}, payload),
    },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString('utf-8') },
    app: { getPath: () => '/tmp/llmsettest' },
  };
});

vi.mock('electron-store', () => {
  const data = new Map<string, unknown>();
  return { default: class { get(k: string){return data.get(k);} set(k:string,v:unknown){data.set(k,v);} has(k:string){return data.has(k);} delete(k:string){data.delete(k);} } };
});

describe('settings IPC', () => {
  it('settings:get returns defaults initially, settings:set persists patch', async () => {
    const { registerSettingsIpc } = await import('../electron/main/ipc/settings');
    const { ipcMain } = await import('electron') as unknown as { ipcMain: { __invoke: (c: string, p: unknown) => Promise<unknown> } };
    registerSettingsIpc();
    const before = await ipcMain.__invoke('settings:get', undefined);
    expect((before as { theme: string }).theme).toBe('system');
    await ipcMain.__invoke('settings:set', { theme: 'dark', apiKey: 'k' });
    const after = await ipcMain.__invoke('settings:get', undefined);
    expect(after).toMatchObject({ theme: 'dark', apiKey: 'k' });
  });
});
