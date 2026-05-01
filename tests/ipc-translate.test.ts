import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent: Array<{ ch: string; payload: unknown }> = [];
const fakeSender = {
  id: 1,
  send: (ch: string, p: unknown) => sent.push({ ch, payload: p }),
  isDestroyed: () => false,
};

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
      __invoke: (ch: string, payload?: unknown) => handlers.get(ch)!({ sender: fakeSender }, payload),
    },
    app: { getPath: () => '/tmp/llmtrtest' },
  };
});

vi.mock('../electron/main/services/gemini', () => ({
  streamTranslate: async ({ onChunk, signal }: { onChunk: (s: string) => void; signal: AbortSignal }) => {
    const chunks = ['Hel', 'lo ', 'world'];
    let full = '';
    for (const c of chunks) {
      if (signal.aborted) throw Object.assign(new Error('a'), { name: 'AbortError' });
      onChunk(c);
      full += c;
      await new Promise((r) => setTimeout(r, 15));
    }
    return { fullText: full, usage: { inputTokens: 1, outputTokens: 3 } };
  },
  mapSdkError: (e: { name?: string }) => e.name === 'AbortError'
    ? { code: 'CANCELLED', message: '已取消' }
    : { code: 'INTERNAL', message: 'x' },
}));

let mockApiKey = 'k';
vi.mock('../electron/main/services/secret-store', () => ({
  loadSettings: () => ({ apiKey: mockApiKey, model: 'gemini-2.0-flash', theme: 'dark', shortcut: 'X', languagePair: 'zh-en', history: { maxRecords: 100 } }),
}));

vi.mock('../electron/main/ipc/history', () => ({
  recordHistory: vi.fn(),
  getAssetDir: () => '/tmp/llmtrtest/assets',
}));

describe('translate IPC', () => {
  beforeEach(() => { sent.length = 0; mockApiKey = 'k'; vi.clearAllMocks(); });

  it('emits chunks then done with status ok', async () => {
    const { registerTranslateIpc } = await import('../electron/main/ipc/translate');
    const { ipcMain } = await import('electron') as unknown as { ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> } };
    registerTranslateIpc();
    const accepted = await ipcMain.__invoke('translate:run', { id: 'r1', mode: 'text', sourceLang: 'zh', targetLang: 'en', text: '你好' });
    expect(accepted).toEqual({ accepted: true });
    await new Promise((r) => setTimeout(r, 120));
    const channels = sent.map((s) => s.ch);
    expect(channels.filter((c) => c === 'translate:chunk')).toHaveLength(3);
    expect(channels).toContain('translate:done');
    const done = sent.find((s) => s.ch === 'translate:done')!.payload as { status: string; fullText: string };
    expect(done).toMatchObject({ status: 'ok', fullText: 'Hello world' });
  });

  it('rejects translate:run when api key missing', async () => {
    mockApiKey = '';
    const { registerTranslateIpc } = await import('../electron/main/ipc/translate');
    const { ipcMain } = await import('electron') as unknown as { ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> } };
    registerTranslateIpc();
    await expect(ipcMain.__invoke('translate:run', { id: 'r2', mode: 'text', sourceLang: 'zh', targetLang: 'en', text: 'hi' }))
      .rejects.toMatchObject({ code: 'NO_API_KEY' });
  });

  it('cancel triggers translate:done with status cancelled', async () => {
    const { registerTranslateIpc } = await import('../electron/main/ipc/translate');
    const { ipcMain } = await import('electron') as unknown as { ipcMain: { __invoke: (c: string, p?: unknown) => Promise<unknown> } };
    registerTranslateIpc();
    await ipcMain.__invoke('translate:run', { id: 'r3', mode: 'text', sourceLang: 'zh', targetLang: 'en', text: 'hi' });
    await new Promise((r) => setTimeout(r, 10));
    await ipcMain.__invoke('translate:cancel', { id: 'r3' });
    await new Promise((r) => setTimeout(r, 80));
    const done = sent.find((s) => s.ch === 'translate:done' && (s.payload as { id: string }).id === 'r3');
    expect(done?.payload).toMatchObject({ status: 'cancelled' });
  });
});
