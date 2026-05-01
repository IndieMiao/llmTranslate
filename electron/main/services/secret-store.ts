import Store from 'electron-store';
import { safeStorage } from 'electron';
import { DEFAULT_SETTINGS, type Settings } from '@shared/types';

interface PersistedShape {
  apiKeyEncrypted?: string; // base64 of encrypted Buffer
  model?: string;
  theme?: Settings['theme'];
  shortcut?: string;
  languagePair?: Settings['languagePair'];
  historyMaxRecords?: number;
}

const store = new Store<PersistedShape>({ name: 'settings' });

let cachedApiKey: string | null = null; // plaintext, in memory only

function decryptApiKey(): string {
  const b64 = store.get('apiKeyEncrypted');
  if (!b64) return '';
  try {
    const buf = Buffer.from(b64 as string, 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return '';
  }
}

export function loadSettings(): Settings {
  if (cachedApiKey === null) cachedApiKey = decryptApiKey();
  return {
    apiKey: cachedApiKey,
    model: (store.get('model') as string | undefined) ?? DEFAULT_SETTINGS.model,
    theme: (store.get('theme') as Settings['theme'] | undefined) ?? DEFAULT_SETTINGS.theme,
    shortcut: (store.get('shortcut') as string | undefined) ?? DEFAULT_SETTINGS.shortcut,
    languagePair: (store.get('languagePair') as Settings['languagePair'] | undefined) ?? DEFAULT_SETTINGS.languagePair,
    history: { maxRecords: (store.get('historyMaxRecords') as number | undefined) ?? DEFAULT_SETTINGS.history.maxRecords },
  };
}

export function saveSettings(patch: Partial<Settings>): void {
  if (patch.apiKey !== undefined) {
    if (patch.apiKey === '') {
      store.delete('apiKeyEncrypted');
      cachedApiKey = '';
    } else {
      const enc = safeStorage.encryptString(patch.apiKey);
      store.set('apiKeyEncrypted', enc.toString('base64'));
      cachedApiKey = patch.apiKey;
    }
  }
  if (patch.model !== undefined) store.set('model', patch.model);
  if (patch.theme !== undefined) store.set('theme', patch.theme);
  if (patch.shortcut !== undefined) store.set('shortcut', patch.shortcut);
  if (patch.languagePair !== undefined) store.set('languagePair', patch.languagePair);
  if (patch.history?.maxRecords !== undefined) store.set('historyMaxRecords', patch.history.maxRecords);
}

// Test-only hook: corrupt stored key and clear cache to force re-decrypt
export function __testCorrupt() {
  store.set('apiKeyEncrypted', 'not-base64-or-decryptable');
  cachedApiKey = null;
}
