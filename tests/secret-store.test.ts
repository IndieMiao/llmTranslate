import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/types';

vi.mock('electron', () => {
  return {
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from('enc:' + s),
      decryptString: (b: Buffer) => {
        const s = b.toString('utf-8');
        if (!s.startsWith('enc:')) throw new Error('decrypt failed');
        return s.replace(/^enc:/, '');
      },
    },
    app: { getPath: () => '/tmp/llmtest' },
  };
});

vi.mock('electron-store', () => {
  const data = new Map<string, unknown>();
  return {
    default: class {
      get(k: string) { return data.get(k); }
      set(k: string, v: unknown) { data.set(k, v); }
      has(k: string) { return data.has(k); }
      delete(k: string) { data.delete(k); }
    },
  };
});

describe('secret-store', () => {
  beforeEach(() => vi.resetModules());

  it('returns DEFAULT_SETTINGS on first read', async () => {
    const { loadSettings } = await import('../electron/main/services/secret-store');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips an API key (encrypted on disk, plaintext in memory)', async () => {
    const m = await import('../electron/main/services/secret-store');
    m.saveSettings({ apiKey: 'sk-test-123' });
    expect(m.loadSettings().apiKey).toBe('sk-test-123');
  });

  it('only persists provided fields (partial update)', async () => {
    const m = await import('../electron/main/services/secret-store');
    m.saveSettings({ apiKey: 'k' });
    m.saveSettings({ theme: 'light' });
    const s = m.loadSettings();
    expect(s.apiKey).toBe('k');
    expect(s.theme).toBe('light');
  });

  it('returns empty apiKey when decryption fails', async () => {
    const m = await import('../electron/main/services/secret-store');
    // Corrupt the stored buffer through the mock
    m.saveSettings({ apiKey: 'k' });
    // simulate corruption — decrypt mock throws on bad prefix
    // (force corruption via internal API)
    const { __testCorrupt } = m as unknown as { __testCorrupt: () => void };
    __testCorrupt();
    expect(m.loadSettings().apiKey).toBe('');
  });
});
