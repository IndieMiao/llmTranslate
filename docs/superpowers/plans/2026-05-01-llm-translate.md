# llmTranslate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop LLM translation app with multimodal Gemini Flash backend, system-tray residency, dark/light/system theming, BYOK encrypted secret storage, and streaming output.

**Architecture:** Electron two-process model. `main` (Node) owns Gemini SDK, SQLite history, encrypted settings, tray, global shortcut. `renderer` (React + Vite) owns UI, themes, IPC client. All external HTTP only in main; renderer has `contextIsolation:true`, `sandbox:true`, no node integration. Streaming chunks from Gemini are forwarded over a side-channel `translate:chunk` event keyed by request `id`.

**Tech Stack:** electron, electron-builder, vite, typescript, react, tailwindcss, shadcn/ui, @google/genai, better-sqlite3, electron-store, electron-log, vitest, @testing-library/react, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-05-01-llm-translate-design.md`

**File structure target:**

```
electron/
  main/
    index.ts              composes app, lifecycle
    window.ts             BrowserWindow factory
    tray.ts               tray icon + menu
    shortcuts.ts          global shortcut registration
    logger.ts             electron-log setup
    ipc/
      translate.ts        translate:run / :cancel handlers + chunk forwarding
      settings.ts         settings:get / :set handlers
      history.ts          history:list/search/delete/clear/favorite
    services/
      gemini.ts           Gemini SDK wrapper, streaming, error mapping
      secret-store.ts     safeStorage + electron-store
      history-db.ts       better-sqlite3 wrapper
      asset-store.ts      asset file copy + orphan cleanup
  preload.ts              contextBridge exposing typed IPC
  tsconfig.json
shared/
  types.ts                Settings, TranslateError, IpcShape, etc.
src/                      renderer
  main.tsx, App.tsx
  pages/Translate.tsx, History.tsx, Settings.tsx
  components/AppShell.tsx, TitleBar.tsx, Sidebar.tsx
  components/translate/LangSwitch.tsx, ModeTabs.tsx,
                       TextInput.tsx, ImageInput.tsx, AudioInput.tsx,
                       TranslationView.tsx
  components/history/HistoryList.tsx
  components/settings/SettingsPanel.tsx
  components/ui/* (shadcn primitives)
  hooks/useTranslate.ts, useTheme.ts, usePaste.ts, useErrorHandler.ts
  lib/ipc.ts, theme.ts, format.ts
  styles/tokens.css, globals.css
tests/                    vitest + RTL
e2e/                      playwright
electron-builder.json
```

---

## Task 1: Project scaffolding (package + tsconfig + lint)

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`, `tsconfig.json`, `electron/tsconfig.json`, `tsconfig.node.json`
- Create: `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, `.editorconfig`

- [ ] **Step 1: Initialize git ignore + editor config**

Create `.gitignore`:
```
node_modules
dist
dist-electron
out
.vite
*.local
*.log
.DS_Store
electron-builder-output
release
```

Create `.editorconfig`:
```
root = true
[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

- [ ] **Step 2: Write package.json**

```json
{
  "name": "llm-translate",
  "version": "0.1.0",
  "private": true,
  "main": "dist-electron/main/index.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && tsc -p electron/tsconfig.json && vite build",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"**/*.{ts,tsx,json,md,css}\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "package": "npm run build && electron-builder --win",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p electron/tsconfig.json --noEmit"
  },
  "dependencies": {
    "@google/genai": "^0.5.0",
    "better-sqlite3": "^11.5.0",
    "electron-log": "^5.2.0",
    "electron-store": "^10.0.0",
    "nanoid": "^5.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-react": "^7.35.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "jsdom": "^25.0.0",
    "playwright": "^1.48.0",
    "prettier": "^3.3.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vite-plugin-electron": "^0.28.0",
    "vite-plugin-electron-renderer": "^0.14.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write base tsconfig**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "allowSyntheticDefaultImports": true,
    "baseUrl": "."
  }
}
```

Create `tsconfig.json` (renderer):
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "dist",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["src", "shared", "tests"]
}
```

Create `electron/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "types": ["node"],
    "outDir": "../dist-electron",
    "rootDir": "..",
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["**/*.ts", "../shared/**/*.ts"]
}
```

Create `tsconfig.node.json` (for vite config):
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": { "module": "ESNext", "types": ["node"] },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Write ESLint + Prettier config**

`.eslintrc.cjs`:
```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: { react: { version: 'detect' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist', 'dist-electron', 'node_modules'],
};
```

`.prettierrc`:
```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

- [ ] **Step 5: Install + commit**

Run:
```bash
npm install
npm run typecheck
```
Expected: typecheck exits 0 (no source files yet, but configs valid).

```bash
git add package.json package-lock.json tsconfig.base.json tsconfig.json tsconfig.node.json electron/tsconfig.json .eslintrc.cjs .prettierrc .gitignore .editorconfig
git commit -m "chore: scaffold project (ts, eslint, prettier, package)"
```

---

## Task 2: Vite + React + Tailwind setup

**Files:**
- Create: `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Create: `src/styles/globals.css`, `src/styles/tokens.css`
- Create: `tailwind.config.js`, `postcss.config.js`

- [ ] **Step 1: Vite config (renderer + electron-vite plugin)**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main/index.ts' },
      preload: { input: 'electron/preload.ts' },
      renderer: {},
    }),
  ],
  build: { outDir: 'dist' },
});
```

- [ ] **Step 2: index.html with strict CSP**

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:" />
    <title>llmTranslate</title>
  </head>
  <body data-theme="dark" class="bg-bg text-fg">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Tailwind + PostCSS config (with theme tokens bridge)**

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        danger: 'var(--danger)',
      },
    },
  },
  plugins: [],
};
```

`postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 4: Theme tokens (design system)**

`src/styles/tokens.css`:
```css
:root[data-theme='dark'] {
  --bg: #0e1116;
  --fg: #e6e6e6;
  --muted: #8a8f98;
  --border: #1f242c;
  --accent: #4f8cff;
  --accent-fg: #ffffff;
  --danger: #ff5b5b;
}
:root[data-theme='light'] {
  --bg: #ffffff;
  --fg: #111111;
  --muted: #6b7280;
  --border: #e5e7eb;
  --accent: #2563eb;
  --accent-fg: #ffffff;
  --danger: #dc2626;
}
```

`src/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import './tokens.css';

html, body, #root { height: 100%; }
body {
  margin: 0;
  font-family: 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 5: Hello World renderer entry**

`src/main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(<App />);
```

`src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-2xl text-fg">llmTranslate</h1>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts index.html tailwind.config.js postcss.config.js src/
git commit -m "feat: vite + react + tailwind scaffolding with theme tokens"
```

---

## Task 3: Electron main process scaffolding (boots a window)

**Files:**
- Create: `electron/main/index.ts`, `electron/main/window.ts`, `electron/preload.ts`
- Create: `shared/types.ts` (initial empty exports — fleshed out in Task 5)

- [ ] **Step 1: Empty shared types**

`shared/types.ts`:
```ts
// Filled in Task 5; this exists so imports don't fail.
export type IpcShape = Record<string, unknown>;
```

- [ ] **Step 2: Window factory**

`electron/main/window.ts`:
```ts
import { BrowserWindow, nativeTheme } from 'electron';
import path from 'node:path';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e1116' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (process.env['VITE_DEV_SERVER_URL']) {
    void win.loadURL(process.env['VITE_DEV_SERVER_URL']);
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  win.once('ready-to-show', () => win.show());
  return win;
}
```

- [ ] **Step 3: App entry**

`electron/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  mainWindow = createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  }
});
```

- [ ] **Step 4: Minimal preload**

`electron/preload.ts`:
```ts
// Will be expanded in Task 12 with the typed IPC bridge.
import { contextBridge } from 'electron';
contextBridge.exposeInMainWorld('electron', { ready: true });
```

- [ ] **Step 5: Smoke test the dev pipeline**

Run:
```bash
npm run dev
```
Expected: Electron window opens showing "llmTranslate" centered on dark background.

Close the window, kill dev server (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add electron/ shared/
git commit -m "feat: electron main process scaffold + minimal preload"
```

---

## Task 4: Test infrastructure (Vitest + RTL)

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/sanity.test.ts`

- [ ] **Step 1: Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 2: Test setup**

`tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Write failing sanity test**

`tests/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test
```
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/
git commit -m "chore: vitest + RTL test infrastructure"
```

---

## Task 5: Shared types (single source of truth)

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Write the types**

`shared/types.ts`:
```ts
// ----- Translation -----
export type TranslateMode = 'text' | 'image' | 'audio';
export type LangCode = 'zh' | 'en';
export type LangPair = `${LangCode}-${LangCode}`;

export interface TranslateRunPayload {
  id: string;
  mode: TranslateMode;
  sourceLang: LangCode;
  targetLang: LangCode;
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
}

export interface TranslateChunkEvent {
  id: string;
  delta: string;
}

export interface TranslateUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type TranslateStatus = 'ok' | 'cancelled';

export interface TranslateDoneEvent {
  id: string;
  fullText: string;
  status: TranslateStatus;
  usage?: TranslateUsage;
}

export type ErrorCode =
  | 'NO_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK'
  | 'MODEL_REFUSED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'CANCELLED'
  | 'INTERNAL';

export interface TranslateErrorEvent {
  id: string;
  code: ErrorCode;
  message: string;
  detail?: string;
}

// ----- Settings -----
export type ThemeChoice = 'dark' | 'light' | 'system';

export interface Settings {
  apiKey: string;          // empty string when unset
  model: string;           // gemini-2.0-flash default
  theme: ThemeChoice;
  shortcut: string;        // e.g. 'Ctrl+Shift+T'
  languagePair: LangPair;  // current direction
  history: { maxRecords: number };
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'gemini-2.0-flash',
  theme: 'system',
  shortcut: 'Ctrl+Shift+T',
  languagePair: 'zh-en',
  history: { maxRecords: 200 },
};

// ----- History -----
export interface HistoryRecord {
  id: string;
  createdAt: number;
  mode: TranslateMode;
  sourceLang: LangCode;
  targetLang: LangCode;
  sourceText: string | null;
  resultText: string;
  assetPath: string | null;
  favorite: boolean;
  tokenUsage: TranslateUsage | null;
}

export interface HistoryListQuery {
  query?: string;
  favoritesOnly?: boolean;
  limit?: number;
  offset?: number;
}

// ----- File limits -----
export const FILE_LIMITS = {
  imageMaxBytes: 10 * 1024 * 1024,
  audioMaxBytes: 20 * 1024 * 1024,
  imageMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
  audioMimes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a', 'audio/ogg'] as const,
  textMaxChars: 50_000,
};
```

- [ ] **Step 2: Test that types compile**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: shared types for translate / settings / history"
```

---

## Task 6: secret-store service (TDD)

**Files:**
- Create: `electron/main/services/secret-store.ts`
- Create: `tests/secret-store.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/secret-store.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/types';

vi.mock('electron', () => {
  const store = new Map<string, Buffer>();
  return {
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from('enc:' + s),
      decryptString: (b: Buffer) => b.toString('utf-8').replace(/^enc:/, ''),
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
    // simulate corruption — decrypt mock just throws on bad prefix
    // (force corruption via internal API)
    const { __testCorrupt } = m as unknown as { __testCorrupt: () => void };
    __testCorrupt();
    expect(m.loadSettings().apiKey).toBe('');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- tests/secret-store.test.ts
```
Expected: fails with "Cannot find module 'secret-store'".

- [ ] **Step 3: Implement secret-store**

`electron/main/services/secret-store.ts`:
```ts
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
    const buf = Buffer.from(b64, 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return '';
  }
}

export function loadSettings(): Settings {
  if (cachedApiKey === null) cachedApiKey = decryptApiKey();
  return {
    apiKey: cachedApiKey,
    model: store.get('model') ?? DEFAULT_SETTINGS.model,
    theme: store.get('theme') ?? DEFAULT_SETTINGS.theme,
    shortcut: store.get('shortcut') ?? DEFAULT_SETTINGS.shortcut,
    languagePair: store.get('languagePair') ?? DEFAULT_SETTINGS.languagePair,
    history: { maxRecords: store.get('historyMaxRecords') ?? DEFAULT_SETTINGS.history.maxRecords },
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

// Test-only hook
export function __testCorrupt() {
  store.set('apiKeyEncrypted', 'not-base64-or-decryptable');
  cachedApiKey = null;
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- tests/secret-store.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/main/services/secret-store.ts tests/secret-store.test.ts
git commit -m "feat: secret-store with safeStorage encryption (DPAPI on Windows)"
```

---

## Task 7: history-db service (TDD)

**Files:**
- Create: `electron/main/services/history-db.ts`
- Create: `electron/main/services/asset-store.ts`
- Create: `tests/history-db.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/history-db.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openHistoryDb, type HistoryDb } from '../electron/main/services/history-db';
import type { HistoryRecord } from '@shared/types';

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'llmtrans-'));
  return d;
}

function rec(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'r1', createdAt: Date.now(), mode: 'text',
    sourceLang: 'zh', targetLang: 'en',
    sourceText: '你好', resultText: 'hello', assetPath: null,
    favorite: false, tokenUsage: null, ...over,
  };
}

describe('history-db', () => {
  let db: HistoryDb;
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    db = openHistoryDb(path.join(dir, 'history.db'));
  });

  it('inserts and lists in DESC order', () => {
    db.insert(rec({ id: 'a', createdAt: 1 }));
    db.insert(rec({ id: 'b', createdAt: 2 }));
    expect(db.list({}).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('searches by FTS over source and result', () => {
    db.insert(rec({ id: '1', sourceText: 'hello world', resultText: '你好世界' }));
    db.insert(rec({ id: '2', sourceText: 'goodbye', resultText: '再见' }));
    expect(db.list({ query: 'hello' }).map((r) => r.id)).toEqual(['1']);
    expect(db.list({ query: '世界' }).map((r) => r.id)).toEqual(['1']);
  });

  it('toggles favorite', () => {
    db.insert(rec({ id: 'x' }));
    db.setFavorite('x', true);
    expect(db.list({ favoritesOnly: true }).map((r) => r.id)).toEqual(['x']);
  });

  it('deletes a record', () => {
    db.insert(rec({ id: 'x' }));
    db.delete('x');
    expect(db.list({})).toEqual([]);
  });

  it('caps non-favorites at maxRecords, never deletes favorites', () => {
    for (let i = 0; i < 5; i++) db.insert(rec({ id: `n${i}`, createdAt: i }));
    db.insert(rec({ id: 'fav', createdAt: 100, favorite: true }));
    db.cleanupCapacity(3);
    const ids = db.list({}).map((r) => r.id);
    expect(ids).toContain('fav');
    expect(ids.filter((id) => id !== 'fav')).toHaveLength(3);
    expect(ids).toContain('n4'); // newest non-fav kept
    expect(ids).not.toContain('n0'); // oldest dropped
  });

  it('clears all (favorites included)', () => {
    db.insert(rec({ id: 'a', favorite: true }));
    db.clear();
    expect(db.list({})).toEqual([]);
  });

  it('integrity check passes for fresh db', () => {
    expect(db.integrityOk()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- tests/history-db.test.ts
```
Expected: fails with "Cannot find module 'history-db'".

- [ ] **Step 3: Implement asset-store stub**

`electron/main/services/asset-store.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';

export function copyAsset(srcBytes: Uint8Array, baseDir: string, id: string, ext: string): string {
  const now = new Date();
  const sub = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  const dir = path.join(baseDir, sub);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}${ext}`);
  fs.writeFileSync(file, srcBytes);
  return file;
}

export function deleteAsset(filePath: string | null): void {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch { /* missing is fine */ }
}

export function listAssetFiles(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) return [];
  const out: string[] = [];
  for (const year of fs.readdirSync(baseDir)) {
    const yPath = path.join(baseDir, year);
    if (!fs.statSync(yPath).isDirectory()) continue;
    for (const month of fs.readdirSync(yPath)) {
      const mPath = path.join(yPath, month);
      if (!fs.statSync(mPath).isDirectory()) continue;
      for (const f of fs.readdirSync(mPath)) out.push(path.join(mPath, f));
    }
  }
  return out;
}
```

- [ ] **Step 4: Implement history-db**

`electron/main/services/history-db.ts`:
```ts
import Database from 'better-sqlite3';
import type { HistoryListQuery, HistoryRecord, TranslateUsage } from '@shared/types';
import { deleteAsset } from './asset-store';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_text TEXT,
  result_text TEXT NOT NULL,
  asset_path TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  token_usage TEXT
);
CREATE INDEX IF NOT EXISTS idx_created  ON translations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorite ON translations(favorite);

CREATE VIRTUAL TABLE IF NOT EXISTS translations_fts USING fts5(
  source_text, result_text, content='translations', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS trans_ai AFTER INSERT ON translations BEGIN
  INSERT INTO translations_fts(rowid, source_text, result_text)
  VALUES (new.rowid, new.source_text, new.result_text);
END;
CREATE TRIGGER IF NOT EXISTS trans_ad AFTER DELETE ON translations BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, source_text, result_text)
  VALUES('delete', old.rowid, old.source_text, old.result_text);
END;
CREATE TRIGGER IF NOT EXISTS trans_au AFTER UPDATE ON translations BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, source_text, result_text)
  VALUES('delete', old.rowid, old.source_text, old.result_text);
  INSERT INTO translations_fts(rowid, source_text, result_text)
  VALUES (new.rowid, new.source_text, new.result_text);
END;
`;

export interface HistoryDb {
  insert(rec: HistoryRecord): void;
  list(q: HistoryListQuery): HistoryRecord[];
  delete(id: string): void;
  clear(): void;
  setFavorite(id: string, favorite: boolean): void;
  cleanupCapacity(maxNonFavorites: number): void;
  listAllAssetPaths(): string[];
  integrityOk(): boolean;
  close(): void;
}

interface Row {
  id: string; created_at: number; mode: string;
  source_lang: string; target_lang: string;
  source_text: string | null; result_text: string;
  asset_path: string | null; favorite: number;
  token_usage: string | null;
}

function rowToRecord(r: Row): HistoryRecord {
  return {
    id: r.id, createdAt: r.created_at, mode: r.mode as HistoryRecord['mode'],
    sourceLang: r.source_lang as HistoryRecord['sourceLang'],
    targetLang: r.target_lang as HistoryRecord['targetLang'],
    sourceText: r.source_text, resultText: r.result_text,
    assetPath: r.asset_path, favorite: !!r.favorite,
    tokenUsage: r.token_usage ? (JSON.parse(r.token_usage) as TranslateUsage) : null,
  };
}

export function openHistoryDb(filePath: string): HistoryDb {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const insertStmt = db.prepare(`
    INSERT INTO translations (id, created_at, mode, source_lang, target_lang,
      source_text, result_text, asset_path, favorite, token_usage)
    VALUES (@id, @createdAt, @mode, @sourceLang, @targetLang,
      @sourceText, @resultText, @assetPath, @favorite, @tokenUsage)
  `);

  return {
    insert(rec) {
      insertStmt.run({
        ...rec,
        favorite: rec.favorite ? 1 : 0,
        tokenUsage: rec.tokenUsage ? JSON.stringify(rec.tokenUsage) : null,
      });
    },
    list(q) {
      const limit = q.limit ?? 200;
      const offset = q.offset ?? 0;
      let rows: Row[];
      if (q.query) {
        rows = db.prepare(`
          SELECT t.* FROM translations t
          JOIN translations_fts f ON f.rowid = t.rowid
          WHERE translations_fts MATCH ?
            ${q.favoritesOnly ? 'AND t.favorite = 1' : ''}
          ORDER BY t.created_at DESC LIMIT ? OFFSET ?
        `).all(q.query, limit, offset) as Row[];
      } else {
        rows = db.prepare(`
          SELECT * FROM translations
          ${q.favoritesOnly ? 'WHERE favorite = 1' : ''}
          ORDER BY created_at DESC LIMIT ? OFFSET ?
        `).all(limit, offset) as Row[];
      }
      return rows.map(rowToRecord);
    },
    delete(id) {
      const row = db.prepare('SELECT asset_path FROM translations WHERE id = ?').get(id) as { asset_path: string | null } | undefined;
      db.prepare('DELETE FROM translations WHERE id = ?').run(id);
      if (row?.asset_path) deleteAsset(row.asset_path);
    },
    clear() {
      const rows = db.prepare('SELECT asset_path FROM translations WHERE asset_path IS NOT NULL').all() as { asset_path: string }[];
      db.prepare('DELETE FROM translations').run();
      for (const r of rows) deleteAsset(r.asset_path);
    },
    setFavorite(id, favorite) {
      db.prepare('UPDATE translations SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
    },
    cleanupCapacity(maxNonFavorites) {
      const rows = db.prepare(`
        SELECT id, asset_path FROM translations
        WHERE favorite = 0
        ORDER BY created_at DESC
      `).all() as { id: string; asset_path: string | null }[];
      const toDelete = rows.slice(maxNonFavorites);
      const tx = db.transaction((items: typeof toDelete) => {
        const stmt = db.prepare('DELETE FROM translations WHERE id = ?');
        for (const it of items) stmt.run(it.id);
      });
      tx(toDelete);
      for (const it of toDelete) if (it.asset_path) deleteAsset(it.asset_path);
    },
    listAllAssetPaths() {
      return (db.prepare('SELECT asset_path FROM translations WHERE asset_path IS NOT NULL').all() as { asset_path: string }[])
        .map((r) => r.asset_path);
    },
    integrityOk() {
      const r = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      return r.integrity_check === 'ok';
    },
    close() { db.close(); },
  };
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- tests/history-db.test.ts
```
Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/main/services/history-db.ts electron/main/services/asset-store.ts tests/history-db.test.ts
git commit -m "feat: history-db service with FTS, capacity cleanup, asset orphan support"
```

---

## Task 8: gemini service (TDD)

**Files:**
- Create: `electron/main/services/gemini.ts`
- Create: `tests/gemini.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/gemini.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mapSdkError, buildContents, buildSystemPrompt } from '../electron/main/services/gemini';

describe('gemini.mapSdkError', () => {
  it('maps 401 to INVALID_API_KEY', () => {
    expect(mapSdkError({ status: 401 }).code).toBe('INVALID_API_KEY');
  });
  it('maps 403 to INVALID_API_KEY', () => {
    expect(mapSdkError({ status: 403 }).code).toBe('INVALID_API_KEY');
  });
  it('maps 429 to RATE_LIMIT', () => {
    expect(mapSdkError({ status: 429 }).code).toBe('RATE_LIMIT');
  });
  it('maps quota errors to QUOTA_EXCEEDED', () => {
    expect(mapSdkError({ status: 429, message: 'quota exceeded' }).code).toBe('QUOTA_EXCEEDED');
  });
  it('maps abort errors to CANCELLED', () => {
    expect(mapSdkError({ name: 'AbortError' }).code).toBe('CANCELLED');
  });
  it('maps network errors', () => {
    expect(mapSdkError({ code: 'ECONNRESET' }).code).toBe('NETWORK');
    expect(mapSdkError({ code: 'ENOTFOUND' }).code).toBe('NETWORK');
    expect(mapSdkError({ message: 'fetch failed' }).code).toBe('NETWORK');
  });
  it('maps safety blocks to MODEL_REFUSED', () => {
    expect(mapSdkError({ message: 'blocked by safety settings' }).code).toBe('MODEL_REFUSED');
  });
  it('falls back to INTERNAL', () => {
    expect(mapSdkError(new Error('weird thing')).code).toBe('INTERNAL');
  });
});

describe('gemini.buildSystemPrompt', () => {
  it('includes both languages', () => {
    const p = buildSystemPrompt('zh', 'en');
    expect(p).toContain('Chinese');
    expect(p).toContain('English');
    expect(p).toMatch(/Output only the translation/i);
  });
  it('reverses for en->zh', () => {
    const p = buildSystemPrompt('en', 'zh');
    expect(p).toContain('English');
    expect(p).toContain('Chinese');
  });
});

describe('gemini.buildContents', () => {
  it('text mode produces a single text part', () => {
    const c = buildContents({ id: 'x', mode: 'text', sourceLang: 'zh', targetLang: 'en', text: '你好' });
    expect(c).toEqual([{ role: 'user', parts: [{ text: '你好' }] }]);
  });
  it('image mode produces inlineData + instruction', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const c = buildContents({ id: 'x', mode: 'image', sourceLang: 'zh', targetLang: 'en', bytes, mime: 'image/png' });
    expect(c[0].parts[0]).toMatchObject({ inlineData: { mimeType: 'image/png' } });
    expect(c[0].parts[1]).toHaveProperty('text');
  });
  it('audio mode produces inlineData + transcribe-and-translate text', () => {
    const c = buildContents({ id: 'x', mode: 'audio', sourceLang: 'zh', targetLang: 'en', bytes: new Uint8Array(2), mime: 'audio/mp3' });
    expect(c[0].parts[0]).toMatchObject({ inlineData: { mimeType: 'audio/mp3' } });
    expect((c[0].parts[1] as { text: string }).text).toMatch(/transcribe/i);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- tests/gemini.test.ts
```
Expected: fails (module not found).

- [ ] **Step 3: Implement gemini service (pure helpers + streamTranslate)**

`electron/main/services/gemini.ts`:
```ts
import { GoogleGenAI } from '@google/genai';
import type {
  ErrorCode, LangCode, TranslateRunPayload, TranslateUsage,
} from '@shared/types';

const LANG_NAMES: Record<LangCode, string> = { zh: 'Chinese', en: 'English' };

export function buildSystemPrompt(src: LangCode, tgt: LangCode): string {
  return `You are a professional translator. Translate the user's input from ${LANG_NAMES[src]} to ${LANG_NAMES[tgt]}. Preserve formatting and tone. Output only the translation, no commentary, no quotes.`;
}

export interface ContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
export interface Content { role: 'user'; parts: ContentPart[]; }

export function buildContents(p: TranslateRunPayload): Content[] {
  if (p.mode === 'text') {
    return [{ role: 'user', parts: [{ text: p.text ?? '' }] }];
  }
  if (!p.bytes || !p.mime) throw new Error('bytes/mime required for non-text mode');
  const data = Buffer.from(p.bytes).toString('base64');
  if (p.mode === 'image') {
    return [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: p.mime, data } },
        { text: 'Translate the visible text in this image.' },
      ],
    }];
  }
  return [{
    role: 'user',
    parts: [
      { inlineData: { mimeType: p.mime, data } },
      { text: 'Transcribe and translate the speech in this audio.' },
    ],
  }];
}

export interface MappedError { code: ErrorCode; message: string; detail?: string; }

export function mapSdkError(err: unknown): MappedError {
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  const msg = (e.message ?? '').toLowerCase();
  if (e.name === 'AbortError') return { code: 'CANCELLED', message: '已取消' };
  if (e.status === 401 || e.status === 403) return { code: 'INVALID_API_KEY', message: 'API key 无效或权限不足', detail: e.message };
  if (e.status === 429) {
    if (msg.includes('quota')) return { code: 'QUOTA_EXCEEDED', message: '配额已用尽', detail: e.message };
    return { code: 'RATE_LIMIT', message: '请求频率超限', detail: e.message };
  }
  if (msg.includes('safety') || msg.includes('blocked')) return { code: 'MODEL_REFUSED', message: '内容被模型安全策略拒绝', detail: e.message };
  if (e.code === 'ECONNRESET' || e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT' || msg.includes('fetch failed') || msg.includes('network')) {
    return { code: 'NETWORK', message: '网络异常', detail: e.message };
  }
  return { code: 'INTERNAL', message: '发生未知错误', detail: e.message ?? String(err) };
}

export interface StreamTranslateOptions {
  apiKey: string;
  model: string;
  payload: TranslateRunPayload;
  signal: AbortSignal;
  onChunk: (delta: string) => void;
}

export interface StreamResult {
  fullText: string;
  usage?: TranslateUsage;
}

export async function streamTranslate(opts: StreamTranslateOptions): Promise<StreamResult> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const stream = await ai.models.generateContentStream({
    model: opts.model,
    contents: buildContents(opts.payload),
    config: {
      systemInstruction: buildSystemPrompt(opts.payload.sourceLang, opts.payload.targetLang),
      abortSignal: opts.signal,
    },
  });

  let fullText = '';
  let usage: TranslateUsage | undefined;
  for await (const chunk of stream) {
    if (opts.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const text = chunk.text ?? '';
    if (text) {
      fullText += text;
      opts.onChunk(text);
    }
    if (chunk.usageMetadata) {
      usage = {
        inputTokens: chunk.usageMetadata.promptTokenCount,
        outputTokens: chunk.usageMetadata.candidatesTokenCount,
      };
    }
  }
  return { fullText, usage };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- tests/gemini.test.ts
```
Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/main/services/gemini.ts tests/gemini.test.ts
git commit -m "feat: gemini service with prompt builders, error mapping, streaming"
```

---

## Task 9: settings IPC handlers

**Files:**
- Create: `electron/main/ipc/settings.ts`
- Create: `tests/ipc-settings.test.ts`
- Modify: `electron/main/index.ts` (register handlers)

- [ ] **Step 1: Failing test**

`tests/ipc-settings.test.ts`:
```ts
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
```

- [ ] **Step 2: Run, expect fail**

```bash
npm run test -- tests/ipc-settings.test.ts
```
Expected: fail (module missing).

- [ ] **Step 3: Implement handler**

`electron/main/ipc/settings.ts`:
```ts
import { ipcMain } from 'electron';
import { loadSettings, saveSettings } from '../services/secret-store';
import type { Settings } from '@shared/types';

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    saveSettings(patch);
    return loadSettings();
  });
}
```

- [ ] **Step 4: Wire into main index**

Edit `electron/main/index.ts`, replace contents with:
```ts
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';
import { registerSettingsIpc } from './ipc/settings';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  registerSettingsIpc();
  mainWindow = createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
});
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- tests/ipc-settings.test.ts
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add electron/main/ipc/settings.ts electron/main/index.ts tests/ipc-settings.test.ts
git commit -m "feat: settings IPC handlers"
```

---

## Task 10: history IPC handlers

**Files:**
- Create: `electron/main/ipc/history.ts`
- Create: `tests/ipc-history.test.ts`
- Modify: `electron/main/index.ts` (register handlers)

- [ ] **Step 1: Failing test**

`tests/ipc-history.test.ts`:
```ts
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
```

- [ ] **Step 2: Implement handler**

`electron/main/ipc/history.ts`:
```ts
import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { openHistoryDb, type HistoryDb } from '../services/history-db';
import { listAssetFiles, deleteAsset } from '../services/asset-store';
import type { HistoryListQuery, HistoryRecord } from '@shared/types';

let db: HistoryDb | null = null;
let assetDir = '';

function getDb(): HistoryDb {
  if (db) return db;
  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'history.db');
  fs.mkdirSync(userData, { recursive: true });
  db = openHistoryDb(dbPath);
  if (!db.integrityOk()) {
    const backup = `${dbPath}.corrupt-${Date.now()}`;
    db.close();
    fs.renameSync(dbPath, backup);
    db = openHistoryDb(dbPath);
  }
  assetDir = path.join(userData, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });
  return db;
}

export function getAssetDir(): string {
  if (!assetDir) getDb();
  return assetDir;
}

export function recordHistory(rec: HistoryRecord): void {
  getDb().insert(rec);
}

export function startupCleanup(maxNonFavorites: number): void {
  const d = getDb();
  d.cleanupCapacity(maxNonFavorites);
  // Orphan asset cleanup
  const referenced = new Set(d.listAllAssetPaths());
  for (const f of listAssetFiles(getAssetDir())) {
    if (!referenced.has(f)) deleteAsset(f);
  }
}

export function registerHistoryIpc(): void {
  ipcMain.handle('history:list', (_e, q: HistoryListQuery) => getDb().list(q ?? {}));
  ipcMain.handle('history:delete', (_e, p: { id: string }) => { getDb().delete(p.id); return { ok: true }; });
  ipcMain.handle('history:clear', () => { getDb().clear(); return { ok: true }; });
  ipcMain.handle('history:favorite', (_e, p: { id: string; favorite: boolean }) => {
    getDb().setFavorite(p.id, p.favorite);
    return { ok: true };
  });
}

export function __recordForTests(r: HistoryRecord): void { recordHistory(r); }
```

- [ ] **Step 3: Wire into main index**

Modify `electron/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';
import { registerSettingsIpc } from './ipc/settings';
import { registerHistoryIpc, startupCleanup } from './ipc/history';
import { loadSettings } from './services/secret-store';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  registerSettingsIpc();
  registerHistoryIpc();
  startupCleanup(loadSettings().history.maxRecords);
  mainWindow = createMainWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow(); });
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- tests/ipc-history.test.ts
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add electron/main/ipc/history.ts electron/main/index.ts tests/ipc-history.test.ts
git commit -m "feat: history IPC + startup cleanup"
```

---

## Task 11: translate IPC handlers (run / cancel + chunk forwarding)

**Files:**
- Create: `electron/main/ipc/translate.ts`
- Create: `tests/ipc-translate.test.ts`
- Modify: `electron/main/index.ts`

- [ ] **Step 1: Failing test (uses fake gemini)**

`tests/ipc-translate.test.ts`:
```ts
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
```

- [ ] **Step 2: Implement translate IPC**

`electron/main/ipc/translate.ts`:
```ts
import { ipcMain, type WebContents } from 'electron';
import { streamTranslate, mapSdkError } from '../services/gemini';
import { loadSettings } from '../services/secret-store';
import { recordHistory, getAssetDir } from './history';
import { copyAsset } from '../services/asset-store';
import type {
  TranslateRunPayload, TranslateChunkEvent, TranslateDoneEvent, TranslateErrorEvent, ErrorCode,
} from '@shared/types';
import { FILE_LIMITS } from '@shared/types';

const inflight = new Map<string, AbortController>();

class IpcError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); this.name = 'IpcError'; }
}

function validatePayload(p: TranslateRunPayload): void {
  if (p.mode === 'text') {
    if (!p.text || !p.text.trim()) throw new IpcError('INTERNAL', '文本为空');
    if (p.text.length > FILE_LIMITS.textMaxChars) throw new IpcError('FILE_TOO_LARGE', '文本过长');
  } else {
    if (!p.bytes || !p.mime) throw new IpcError('INTERNAL', '缺少文件数据');
    const limit = p.mode === 'image' ? FILE_LIMITS.imageMaxBytes : FILE_LIMITS.audioMaxBytes;
    if (p.bytes.byteLength > limit) throw new IpcError('FILE_TOO_LARGE', '文件超出大小限制');
    const mimes: readonly string[] = p.mode === 'image' ? FILE_LIMITS.imageMimes : FILE_LIMITS.audioMimes;
    if (!mimes.includes(p.mime)) throw new IpcError('UNSUPPORTED_FORMAT', '不支持的文件类型');
  }
}

function extFor(mime: string): string {
  const m: Record<string, string> = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
    'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
    'audio/m4a': '.m4a', 'audio/x-m4a': '.m4a', 'audio/ogg': '.ogg',
  };
  return m[mime] ?? '.bin';
}

function send<T>(wc: WebContents, ch: string, payload: T): void {
  if (wc.isDestroyed()) return;
  wc.send(ch, payload);
}

async function runStream(wc: WebContents, payload: TranslateRunPayload): Promise<void> {
  const settings = loadSettings();
  const ctrl = new AbortController();
  inflight.set(payload.id, ctrl);
  try {
    const result = await streamTranslate({
      apiKey: settings.apiKey,
      model: settings.model,
      payload,
      signal: ctrl.signal,
      onChunk: (delta) => send<TranslateChunkEvent>(wc, 'translate:chunk', { id: payload.id, delta }),
    });
    if (ctrl.signal.aborted) {
      send<TranslateDoneEvent>(wc, 'translate:done', { id: payload.id, fullText: result.fullText, status: 'cancelled' });
      return;
    }
    let assetPath: string | null = null;
    if ((payload.mode === 'image' || payload.mode === 'audio') && payload.bytes && payload.mime) {
      assetPath = copyAsset(payload.bytes, getAssetDir(), payload.id, extFor(payload.mime));
    }
    recordHistory({
      id: payload.id,
      createdAt: Date.now(),
      mode: payload.mode,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      sourceText: payload.mode === 'text' ? (payload.text ?? null) : null,
      resultText: result.fullText,
      assetPath,
      favorite: false,
      tokenUsage: result.usage ?? null,
    });
    send<TranslateDoneEvent>(wc, 'translate:done', { id: payload.id, fullText: result.fullText, status: 'ok', usage: result.usage });
  } catch (err) {
    const m = mapSdkError(err);
    if (m.code === 'CANCELLED') {
      send<TranslateDoneEvent>(wc, 'translate:done', { id: payload.id, fullText: '', status: 'cancelled' });
    } else {
      send<TranslateErrorEvent>(wc, 'translate:error', { id: payload.id, code: m.code, message: m.message, detail: m.detail });
    }
  } finally {
    inflight.delete(payload.id);
  }
}

export function registerTranslateIpc(): void {
  ipcMain.handle('translate:run', async (e, payload: TranslateRunPayload) => {
    if (!loadSettings().apiKey) throw new IpcError('NO_API_KEY', '请先在设置中填入 API key');
    validatePayload(payload);
    const wc = e.sender;
    queueMicrotask(() => { void runStream(wc, payload); });
    return { accepted: true };
  });

  ipcMain.handle('translate:cancel', (_e, p: { id: string }) => {
    const ctrl = inflight.get(p.id);
    if (!ctrl) return { cancelled: false };
    ctrl.abort();
    return { cancelled: true };
  });
}
```

- [ ] **Step 3: Wire into main**

Add to `electron/main/index.ts` after history registration:
```ts
import { registerTranslateIpc } from './ipc/translate';
// ... inside whenReady, after registerHistoryIpc():
registerTranslateIpc();
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- tests/ipc-translate.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/main/ipc/translate.ts electron/main/index.ts tests/ipc-translate.test.ts
git commit -m "feat: translate IPC with streaming, cancel, validation, history capture"
```

---

## Task 12: preload + renderer IPC client

**Files:**
- Modify: `electron/preload.ts`
- Create: `src/lib/ipc.ts`
- Create: `src/types/ipc.d.ts`

- [ ] **Step 1: Define the bridge surface in preload**

`electron/preload.ts`:
```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  TranslateRunPayload, TranslateChunkEvent, TranslateDoneEvent, TranslateErrorEvent,
  Settings, HistoryListQuery, HistoryRecord,
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
  },
  theme: {
    onSystemChanged: (cb: (e: { isDark: boolean }) => void) => {
      const wrap = (_: IpcRendererEvent, ev: { isDark: boolean }) => cb(ev);
      ipcRenderer.on('theme:system-changed', wrap);
      return () => ipcRenderer.off('theme:system-changed', wrap);
    },
  },
  app: {
    openLogDir: () => ipcRenderer.invoke('app:open-log-dir'),
    showWindow: () => ipcRenderer.invoke('app:show-window'),
  },
};

contextBridge.exposeInMainWorld('electron', api);
export type ElectronApi = typeof api;
```

- [ ] **Step 2: Renderer-side global types**

`src/types/ipc.d.ts`:
```ts
import type { ElectronApi } from '../../electron/preload';
declare global {
  interface Window { electron: ElectronApi; }
}
export {};
```

- [ ] **Step 3: Convenience client (renderer)**

`src/lib/ipc.ts`:
```ts
export const ipc = () => window.electron;
```

- [ ] **Step 4: Verify build**

```bash
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add electron/preload.ts src/lib/ipc.ts src/types/ipc.d.ts
git commit -m "feat: preload contextBridge + renderer IPC client"
```

---

## Task 13: Theme system (renderer + system theme sync)

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/hooks/useTheme.ts`
- Create: `tests/theme.test.tsx`
- Modify: `electron/main/index.ts` (broadcast nativeTheme changes)
- Modify: `src/App.tsx` (apply theme on mount)

- [ ] **Step 1: Failing tests**

`tests/theme.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { applyTheme, resolveTheme } from '@/lib/theme';
import { useTheme } from '@/hooks/useTheme';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  (window as unknown as { electron?: unknown }).electron = {
    settings: {
      get: vi.fn().mockResolvedValue({ apiKey: '', model: 'g', theme: 'dark', shortcut: '', languagePair: 'zh-en', history: { maxRecords: 1 } }),
      set: vi.fn().mockImplementation((p) => Promise.resolve({ theme: p.theme })),
    },
    theme: { onSystemChanged: () => () => undefined },
  };
});

describe('theme', () => {
  it('applyTheme sets data-theme attribute', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
  it('resolveTheme honors system isDark', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('useTheme initializes from settings', async () => {
    function Probe() {
      const { resolved } = useTheme();
      return <div data-testid="t">{resolved}</div>;
    }
    await act(async () => { render(<Probe />); });
    expect(screen.getByTestId('t').textContent).toBe('dark');
  });
});
```

- [ ] **Step 2: Implement lib/theme.ts**

`src/lib/theme.ts`:
```ts
import type { ThemeChoice } from '@shared/types';

export function applyTheme(resolved: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function resolveTheme(choice: ThemeChoice, isDark: boolean): 'dark' | 'light' {
  if (choice === 'system') return isDark ? 'dark' : 'light';
  return choice;
}
```

- [ ] **Step 3: Implement useTheme hook**

`src/hooks/useTheme.ts`:
```ts
import { useEffect, useState } from 'react';
import type { ThemeChoice } from '@shared/types';
import { applyTheme, resolveTheme } from '@/lib/theme';
import { ipc } from '@/lib/ipc';

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [isDark, setIsDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    void ipc().settings.get().then((s) => setChoice(s.theme));
    return ipc().theme.onSystemChanged((e) => setIsDark(e.isDark));
  }, []);

  const resolved = resolveTheme(choice, isDark);
  useEffect(() => { applyTheme(resolved); }, [resolved]);

  async function setTheme(next: ThemeChoice) {
    await ipc().settings.set({ theme: next });
    setChoice(next);
  }
  return { choice, resolved, setTheme };
}
```

- [ ] **Step 4: Broadcast nativeTheme changes from main**

Add to `electron/main/index.ts` (inside `whenReady`):
```ts
import { nativeTheme, BrowserWindow as BW } from 'electron';
// ... after createMainWindow:
nativeTheme.on('updated', () => {
  for (const w of BW.getAllWindows()) {
    w.webContents.send('theme:system-changed', { isDark: nativeTheme.shouldUseDarkColors });
  }
});
```

- [ ] **Step 5: Apply theme at app boot**

Replace `src/App.tsx`:
```tsx
import { useTheme } from '@/hooks/useTheme';

export default function App() {
  useTheme(); // applies on mount, reacts to changes
  return (
    <div className="flex h-full items-center justify-center bg-bg text-fg">
      <h1 className="text-2xl">llmTranslate</h1>
    </div>
  );
}
```

- [ ] **Step 6: Run tests + smoke**

```bash
npm run test -- tests/theme.test.tsx
```
Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/theme.ts src/hooks/useTheme.ts src/App.tsx tests/theme.test.tsx electron/main/index.ts
git commit -m "feat: theme system with dark/light/system + native sync"
```

---

## Task 14: AppShell + TitleBar + Sidebar + routing

**Files:**
- Create: `src/components/AppShell.tsx`, `TitleBar.tsx`, `Sidebar.tsx`
- Create: `src/pages/Translate.tsx`, `History.tsx`, `Settings.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Pages as placeholders (filled in later tasks)**

`src/pages/Translate.tsx`, `History.tsx`, `Settings.tsx` (each):
```tsx
export default function Translate() { return <div className="p-6">翻译</div>; }
```
(adjust label per file: 翻译 / 历史 / 设置)

- [ ] **Step 2: TitleBar component (frameless drag region)**

`src/components/TitleBar.tsx`:
```tsx
export function TitleBar() {
  return (
    <div
      className="h-9 flex items-center justify-between px-3 border-b border-border bg-bg select-none"
      style={{ ['-webkit-app-region' as never]: 'drag' } as React.CSSProperties}
    >
      <div className="text-sm font-medium text-fg">llmTranslate</div>
      <div className="flex gap-1" style={{ ['-webkit-app-region' as never]: 'no-drag' } as React.CSSProperties}>
        <button onClick={() => window.electron.app.showWindow()} className="text-xs text-muted px-2 hover:text-fg">_</button>
        <button onClick={() => window.close()} className="text-xs text-muted px-2 hover:text-danger">×</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Sidebar**

`src/components/Sidebar.tsx`:
```tsx
type Page = 'translate' | 'history' | 'settings';
interface Props { current: Page; onChange: (p: Page) => void; }

const items: { id: Page; label: string }[] = [
  { id: 'translate', label: '翻译' },
  { id: 'history', label: '历史' },
  { id: 'settings', label: '设置' },
];

export function Sidebar({ current, onChange }: Props) {
  return (
    <nav className="w-44 border-r border-border bg-bg flex flex-col py-2">
      {items.map((it) => (
        <button
          key={it.id}
          className={`text-left px-4 py-2 text-sm ${
            current === it.id ? 'text-fg bg-[color:var(--border)]' : 'text-muted hover:text-fg'
          }`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: AppShell**

`src/components/AppShell.tsx`:
```tsx
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import Translate from '@/pages/Translate';
import History from '@/pages/History';
import Settings from '@/pages/Settings';

export function AppShell() {
  const [page, setPage] = useState<'translate' | 'history' | 'settings'>('translate');
  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar current={page} onChange={setPage} />
        <main className="flex-1 overflow-hidden">
          {page === 'translate' && <Translate />}
          {page === 'history' && <History />}
          {page === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Replace App**

`src/App.tsx`:
```tsx
import { useTheme } from '@/hooks/useTheme';
import { AppShell } from '@/components/AppShell';

export default function App() {
  useTheme();
  return <AppShell />;
}
```

- [ ] **Step 6: Smoke**

```bash
npm run dev
```
Expected: window with title bar, sidebar (3 items), content swaps when clicking sidebar items.

- [ ] **Step 7: Commit**

```bash
git add src/components/ src/pages/ src/App.tsx
git commit -m "feat: AppShell + TitleBar + Sidebar + page routing"
```

---

## Task 15: LangSwitch + ModeTabs

**Files:**
- Create: `src/components/translate/LangSwitch.tsx`
- Create: `src/components/translate/ModeTabs.tsx`
- Create: `tests/lang-switch.test.tsx`
- Create: `tests/mode-tabs.test.tsx`

- [ ] **Step 1: Failing tests**

`tests/lang-switch.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LangSwitch } from '@/components/translate/LangSwitch';

describe('LangSwitch', () => {
  it('shows current direction and reverses on click', async () => {
    const onChange = vi.fn();
    render(<LangSwitch source="zh" target="en" onChange={onChange} />);
    expect(screen.getByText(/中.*→.*英/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith({ source: 'en', target: 'zh' });
  });
});
```

`tests/mode-tabs.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeTabs } from '@/components/translate/ModeTabs';

describe('ModeTabs', () => {
  it('renders 3 modes and emits change', async () => {
    const onChange = vi.fn();
    render(<ModeTabs current="text" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: '图片' }));
    expect(onChange).toHaveBeenCalledWith('image');
  });
});
```

- [ ] **Step 2: Implement LangSwitch**

`src/components/translate/LangSwitch.tsx`:
```tsx
import type { LangCode } from '@shared/types';
const LABEL: Record<LangCode, string> = { zh: '中', en: '英' };

interface Props {
  source: LangCode;
  target: LangCode;
  onChange: (next: { source: LangCode; target: LangCode }) => void;
}

export function LangSwitch({ source, target, onChange }: Props) {
  return (
    <button
      onClick={() => onChange({ source: target, target: source })}
      className="px-3 h-9 rounded-md border border-border text-sm text-fg hover:bg-[color:var(--border)]"
    >
      {LABEL[source]} → {LABEL[target]} ⇄
    </button>
  );
}
```

- [ ] **Step 3: Implement ModeTabs**

`src/components/translate/ModeTabs.tsx`:
```tsx
import type { TranslateMode } from '@shared/types';

const ITEMS: { id: TranslateMode; label: string }[] = [
  { id: 'text', label: '文本' },
  { id: 'image', label: '图片' },
  { id: 'audio', label: '音频' },
];

interface Props { current: TranslateMode; onChange: (m: TranslateMode) => void; }

export function ModeTabs({ current, onChange }: Props) {
  return (
    <div role="tablist" className="inline-flex border border-border rounded-md overflow-hidden">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={current === it.id}
          onClick={() => onChange(it.id)}
          className={`px-3 h-9 text-sm ${current === it.id ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- tests/lang-switch.test.tsx tests/mode-tabs.test.tsx
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/translate/LangSwitch.tsx src/components/translate/ModeTabs.tsx tests/lang-switch.test.tsx tests/mode-tabs.test.tsx
git commit -m "feat: LangSwitch + ModeTabs components"
```

---

## Task 16: Input components (text / image / audio)

**Files:**
- Create: `src/components/translate/TextInput.tsx`
- Create: `src/components/translate/ImageInput.tsx`
- Create: `src/components/translate/AudioInput.tsx`
- Create: `tests/inputs.test.tsx`

- [ ] **Step 1: Failing tests**

`tests/inputs.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextInput } from '@/components/translate/TextInput';
import { ImageInput } from '@/components/translate/ImageInput';

describe('TextInput', () => {
  it('reports text changes and char count', async () => {
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'hi');
    expect(onChange).toHaveBeenLastCalledWith('hi');
  });

  it('rejects oversized text with error', async () => {
    const onChange = vi.fn();
    const big = 'a'.repeat(60_000);
    render(<TextInput value={big} onChange={onChange} />);
    expect(screen.getByText(/超出/)).toBeInTheDocument();
  });
});

describe('ImageInput', () => {
  it('rejects non-image and oversized files', () => {
    const onSelect = vi.fn();
    render(<ImageInput onSelect={onSelect} />);
    const dz = screen.getByTestId('image-dropzone');
    const big = new File([new ArrayBuffer(11 * 1024 * 1024)], 'a.png', { type: 'image/png' });
    fireEvent.drop(dz, { dataTransfer: { files: [big] } });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/超出/)).toBeInTheDocument();
  });

  it('accepts valid image and emits bytes', async () => {
    const onSelect = vi.fn();
    render(<ImageInput onSelect={onSelect} />);
    const dz = screen.getByTestId('image-dropzone');
    const ok = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    fireEvent.drop(dz, { dataTransfer: { files: [ok] } });
    await new Promise((r) => setTimeout(r, 0));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ mime: 'image/png' }));
  });
});
```

- [ ] **Step 2: TextInput**

`src/components/translate/TextInput.tsx`:
```tsx
import { FILE_LIMITS } from '@shared/types';

interface Props { value: string; onChange: (next: string) => void; }

export function TextInput({ value, onChange }: Props) {
  const over = value.length > FILE_LIMITS.textMaxChars;
  return (
    <div className="flex flex-col gap-1">
      <textarea
        className="w-full min-h-[160px] rounded-md border border-border bg-bg text-fg p-3 outline-none focus:border-accent resize-none"
        placeholder="输入要翻译的文字（Ctrl+Enter 翻译，Esc 取消）"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="text-xs text-muted flex justify-between">
        <span>{value.length} / {FILE_LIMITS.textMaxChars}</span>
        {over && <span className="text-danger">超出最大长度</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Helper hook for file zone (used by image and audio)**

Inline helper in each input. ImageInput:

`src/components/translate/ImageInput.tsx`:
```tsx
import { useState } from 'react';
import { FILE_LIMITS } from '@shared/types';

export interface SelectedFile { bytes: Uint8Array; mime: string; name: string; previewUrl?: string; }
interface Props { onSelect: (f: SelectedFile) => void; }

export function ImageInput({ onSelect }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);

  async function accept(file: File) {
    setError(null);
    if (!(FILE_LIMITS.imageMimes as readonly string[]).includes(file.type)) {
      setError('不支持的图片类型');
      return;
    }
    if (file.size > FILE_LIMITS.imageMaxBytes) {
      setError('文件超出 10MB 限制');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const previewUrl = URL.createObjectURL(file);
    const f = { bytes, mime: file.type, name: file.name, previewUrl };
    setSelected(f);
    onSelect(f);
  }

  return (
    <div
      data-testid="image-dropzone"
      className="border-2 border-dashed border-border rounded-md p-6 text-center cursor-pointer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void accept(f); }}
      onClick={() => document.getElementById('img-file-input')?.click()}
    >
      <input id="img-file-input" type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); }} />
      {selected ? (
        <img src={selected.previewUrl} alt={selected.name} className="max-h-48 mx-auto rounded" />
      ) : (
        <div className="text-muted text-sm">拖拽 / 粘贴 / 点击 上传图片（PNG/JPEG/WEBP/GIF, ≤10MB）</div>
      )}
      {error && <div className="mt-2 text-danger text-xs">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: AudioInput (mirrors ImageInput, audio mimes)**

`src/components/translate/AudioInput.tsx`:
```tsx
import { useState } from 'react';
import { FILE_LIMITS } from '@shared/types';
import type { SelectedFile } from './ImageInput';

interface Props { onSelect: (f: SelectedFile) => void; }

export function AudioInput({ onSelect }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);

  async function accept(file: File) {
    setError(null);
    if (!(FILE_LIMITS.audioMimes as readonly string[]).includes(file.type)) {
      setError('不支持的音频类型');
      return;
    }
    if (file.size > FILE_LIMITS.audioMaxBytes) {
      setError('文件超出 20MB 限制');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const f: SelectedFile = { bytes, mime: file.type, name: file.name };
    setSelected(f);
    onSelect(f);
  }

  return (
    <div
      data-testid="audio-dropzone"
      className="border-2 border-dashed border-border rounded-md p-6 text-center cursor-pointer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void accept(f); }}
      onClick={() => document.getElementById('audio-file-input')?.click()}
    >
      <input id="audio-file-input" type="file" accept="audio/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); }} />
      {selected ? <div className="text-fg text-sm">{selected.name}</div> :
        <div className="text-muted text-sm">拖拽 / 点击 上传音频（MP3/WAV/M4A/OGG, ≤20MB）</div>}
      {error && <div className="mt-2 text-danger text-xs">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- tests/inputs.test.tsx
```
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/translate/TextInput.tsx src/components/translate/ImageInput.tsx src/components/translate/AudioInput.tsx tests/inputs.test.tsx
git commit -m "feat: TextInput / ImageInput / AudioInput with validation"
```

---

## Task 17: TranslationView (streaming display + actions)

**Files:**
- Create: `src/components/translate/TranslationView.tsx`
- Create: `tests/translation-view.test.tsx`

- [ ] **Step 1: Failing test**

`tests/translation-view.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranslationView } from '@/components/translate/TranslationView';

describe('TranslationView', () => {
  it('renders streaming text with caret while streaming', () => {
    render(<TranslationView text="hel" status="streaming" onCopy={vi.fn()} onFavorite={vi.fn()} onRetranslate={vi.fn()} />);
    expect(screen.getByText('hel')).toBeInTheDocument();
    expect(screen.getByTestId('caret')).toBeInTheDocument();
  });
  it('shows actions only after status=ok', async () => {
    const onCopy = vi.fn();
    render(<TranslationView text="hello" status="ok" onCopy={onCopy} onFavorite={vi.fn()} onRetranslate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(onCopy).toHaveBeenCalled();
  });
  it('renders error when status=error', () => {
    render(<TranslationView text="" status="error" errorMessage="API key 无效" onCopy={vi.fn()} onFavorite={vi.fn()} onRetranslate={vi.fn()} />);
    expect(screen.getByText('API key 无效')).toBeInTheDocument();
  });
  it('shows cancelled tag when status=cancelled', () => {
    render(<TranslationView text="hel" status="cancelled" onCopy={vi.fn()} onFavorite={vi.fn()} onRetranslate={vi.fn()} />);
    expect(screen.getByText(/已取消/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

`src/components/translate/TranslationView.tsx`:
```tsx
export type ViewStatus = 'idle' | 'streaming' | 'ok' | 'cancelled' | 'error';

interface Props {
  text: string;
  status: ViewStatus;
  errorMessage?: string;
  onCopy: () => void;
  onFavorite: () => void;
  onRetranslate: () => void;
}

export function TranslationView({ text, status, errorMessage, onCopy, onFavorite, onRetranslate }: Props) {
  return (
    <div className="border border-border rounded-md p-4 min-h-[120px] flex flex-col gap-2">
      {status === 'error' ? (
        <div className="text-danger text-sm">{errorMessage}</div>
      ) : (
        <div className="text-fg whitespace-pre-wrap break-words">
          {text}
          {status === 'streaming' && <span data-testid="caret" className="inline-block w-2 h-4 align-middle bg-accent ml-0.5 animate-pulse" />}
          {status === 'cancelled' && <span className="ml-2 text-xs text-muted">[已取消]</span>}
        </div>
      )}
      {status === 'ok' && (
        <div className="flex gap-2 mt-1">
          <button className="text-xs text-muted hover:text-fg" onClick={onCopy}>复制</button>
          <button className="text-xs text-muted hover:text-fg" onClick={onFavorite}>收藏</button>
          <button className="text-xs text-muted hover:text-fg" onClick={onRetranslate}>重新翻译</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test -- tests/translation-view.test.tsx
```
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/translate/TranslationView.tsx tests/translation-view.test.tsx
git commit -m "feat: TranslationView with streaming caret + action buttons"
```

---

## Task 18: usePaste hook (clipboard image/text routing)

**Files:**
- Create: `src/hooks/usePaste.ts`
- Create: `tests/use-paste.test.tsx`

- [ ] **Step 1: Failing test**

`tests/use-paste.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { usePaste } from '@/hooks/usePaste';

function Probe(props: Parameters<typeof usePaste>[0]) {
  usePaste(props);
  return <div data-testid="root" />;
}

describe('usePaste', () => {
  it('routes pasted image to onImage', async () => {
    const onImage = vi.fn();
    const onText = vi.fn();
    const onAudio = vi.fn();
    render(<Probe onImage={onImage} onText={onText} onAudio={onAudio} />);
    const file = new File([new Uint8Array(3)], 'a.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    fireEvent.paste(window, { clipboardData: dt });
    await new Promise((r) => setTimeout(r, 0));
    expect(onImage).toHaveBeenCalled();
  });
  it('routes pasted text to onText', () => {
    const onImage = vi.fn();
    const onText = vi.fn();
    const onAudio = vi.fn();
    render(<Probe onImage={onImage} onText={onText} onAudio={onAudio} />);
    fireEvent.paste(window, { clipboardData: { items: [], files: [], getData: () => '你好' } });
    expect(onText).toHaveBeenCalledWith('你好');
  });
});
```

- [ ] **Step 2: Implement**

`src/hooks/usePaste.ts`:
```ts
import { useEffect } from 'react';
import type { SelectedFile } from '@/components/translate/ImageInput';

interface Opts {
  onImage: (f: SelectedFile) => void;
  onAudio: (f: SelectedFile) => void;
  onText: (s: string) => void;
}

export function usePaste({ onImage, onAudio, onText }: Opts) {
  useEffect(() => {
    async function handler(e: ClipboardEvent) {
      const dt = e.clipboardData;
      if (!dt) return;
      // Image first
      for (const it of Array.from(dt.items ?? [])) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            onImage({ bytes, mime: file.type, name: file.name || 'pasted.png', previewUrl: URL.createObjectURL(file) });
            return;
          }
        }
      }
      // Audio file
      for (const f of Array.from(dt.files ?? [])) {
        if (f.type.startsWith('audio/')) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          onAudio({ bytes, mime: f.type, name: f.name });
          return;
        }
      }
      const text = dt.getData('text/plain');
      if (text) onText(text);
    }
    window.addEventListener('paste', handler as EventListener);
    return () => window.removeEventListener('paste', handler as EventListener);
  }, [onImage, onAudio, onText]);
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test -- tests/use-paste.test.tsx
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePaste.ts tests/use-paste.test.tsx
git commit -m "feat: usePaste hook routing image/audio/text from clipboard"
```

---

## Task 19: useTranslate + useErrorHandler + Translate page

**Files:**
- Create: `src/hooks/useTranslate.ts`
- Create: `src/hooks/useErrorHandler.ts`
- Create: `src/components/ui/Toast.tsx`
- Modify: `src/pages/Translate.tsx`
- Create: `tests/use-translate.test.tsx`

- [ ] **Step 1: Failing test for useTranslate**

`tests/use-translate.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTranslate } from '@/hooks/useTranslate';

let chunkCb: ((e: { id: string; delta: string }) => void) | null = null;
let doneCb: ((e: { id: string; fullText: string; status: string }) => void) | null = null;
let errorCb: ((e: { id: string; code: string; message: string }) => void) | null = null;

beforeEach(() => {
  chunkCb = null; doneCb = null; errorCb = null;
  (window as unknown as { electron?: unknown }).electron = {
    translate: {
      run: vi.fn().mockResolvedValue({ accepted: true }),
      cancel: vi.fn().mockResolvedValue({ cancelled: true }),
      onChunk: (cb: typeof chunkCb) => { chunkCb = cb; return () => undefined; },
      onDone: (cb: typeof doneCb) => { doneCb = cb; return () => undefined; },
      onError: (cb: typeof errorCb) => { errorCb = cb; return () => undefined; },
    },
  };
});

describe('useTranslate', () => {
  it('accumulates chunks and reaches ok', async () => {
    const { result } = renderHook(() => useTranslate());
    await act(async () => { await result.current.run({ mode: 'text', sourceLang: 'zh', targetLang: 'en', text: 'x' }); });
    act(() => { chunkCb!({ id: result.current.id!, delta: 'he' }); });
    act(() => { chunkCb!({ id: result.current.id!, delta: 'llo' }); });
    expect(result.current.text).toBe('hello');
    expect(result.current.status).toBe('streaming');
    act(() => { doneCb!({ id: result.current.id!, fullText: 'hello', status: 'ok' }); });
    expect(result.current.status).toBe('ok');
  });

  it('error path sets status=error with message', async () => {
    const { result } = renderHook(() => useTranslate());
    await act(async () => { await result.current.run({ mode: 'text', sourceLang: 'zh', targetLang: 'en', text: 'x' }); });
    act(() => { errorCb!({ id: result.current.id!, code: 'NETWORK', message: '网络异常' }); });
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('网络异常');
  });
});
```

- [ ] **Step 2: Implement useTranslate**

`src/hooks/useTranslate.ts`:
```ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import type { TranslateMode, LangCode, ErrorCode } from '@shared/types';
import { ipc } from '@/lib/ipc';

export type Status = 'idle' | 'streaming' | 'ok' | 'cancelled' | 'error';

export interface RunArgs {
  mode: TranslateMode;
  sourceLang: LangCode;
  targetLang: LangCode;
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
}

export function useTranslate() {
  const [id, setId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [errorCode, setErrorCode] = useState<ErrorCode | undefined>();
  const lastArgs = useRef<RunArgs | null>(null);

  useEffect(() => {
    const offChunk = ipc().translate.onChunk((e) => { if (e.id === id) setText((t) => t + e.delta); });
    const offDone = ipc().translate.onDone((e) => {
      if (e.id !== id) return;
      setStatus(e.status === 'cancelled' ? 'cancelled' : 'ok');
      if (e.status === 'ok') setText(e.fullText);
    });
    const offError = ipc().translate.onError((e) => {
      if (e.id !== id) return;
      setStatus('error');
      setErrorMessage(e.message);
      setErrorCode(e.code);
    });
    return () => { offChunk(); offDone(); offError(); };
  }, [id]);

  const run = useCallback(async (args: RunArgs) => {
    const newId = nanoid();
    lastArgs.current = args;
    setId(newId);
    setText('');
    setStatus('streaming');
    setErrorMessage(undefined);
    setErrorCode(undefined);
    try {
      await ipc().translate.run({ id: newId, ...args });
    } catch (err) {
      const e = err as { code?: ErrorCode; message?: string };
      setStatus('error');
      setErrorCode(e.code ?? 'INTERNAL');
      setErrorMessage(e.message ?? '提交失败');
    }
  }, []);

  const cancel = useCallback(async () => {
    if (id && status === 'streaming') await ipc().translate.cancel(id);
  }, [id, status]);

  const retry = useCallback(async () => {
    if (lastArgs.current) await run(lastArgs.current);
  }, [run]);

  return { id, text, status, errorMessage, errorCode, run, cancel, retry };
}
```

- [ ] **Step 3: Implement useErrorHandler (Toast bridge)**

`src/components/ui/Toast.tsx`:
```tsx
import { useEffect, useState } from 'react';
type Toast = { id: number; message: string; kind: 'error' | 'info' };
let id = 0;
const listeners = new Set<(t: Toast) => void>();

export function pushToast(message: string, kind: 'error' | 'info' = 'info') {
  const t: Toast = { id: ++id, message, kind };
  listeners.forEach((fn) => fn(t));
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const fn = (t: Toast) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {items.map((t) => (
        <div key={t.id} className={`px-3 py-2 rounded-md text-sm border ${t.kind === 'error' ? 'border-danger text-danger' : 'border-border text-fg'} bg-bg`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
```

`src/hooks/useErrorHandler.ts`:
```ts
import type { ErrorCode } from '@shared/types';
import { pushToast } from '@/components/ui/Toast';

export function showErrorByCode(code: ErrorCode | undefined, message: string): void {
  if (!code) return;
  pushToast(message, 'error');
}
```

- [ ] **Step 4: Translate page wiring**

`src/pages/Translate.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { LangSwitch } from '@/components/translate/LangSwitch';
import { ModeTabs } from '@/components/translate/ModeTabs';
import { TextInput } from '@/components/translate/TextInput';
import { ImageInput, type SelectedFile } from '@/components/translate/ImageInput';
import { AudioInput } from '@/components/translate/AudioInput';
import { TranslationView } from '@/components/translate/TranslationView';
import { useTranslate } from '@/hooks/useTranslate';
import { usePaste } from '@/hooks/usePaste';
import { showErrorByCode } from '@/hooks/useErrorHandler';
import { ipc } from '@/lib/ipc';
import type { LangCode, TranslateMode } from '@shared/types';

export default function Translate() {
  const [mode, setMode] = useState<TranslateMode>('text');
  const [src, setSrc] = useState<LangCode>('zh');
  const [tgt, setTgt] = useState<LangCode>('en');
  const [text, setText] = useState('');
  const [file, setFile] = useState<SelectedFile | null>(null);
  const t = useTranslate();

  useEffect(() => { void ipc().settings.get().then((s) => {
    const [a, b] = s.languagePair.split('-') as [LangCode, LangCode];
    setSrc(a); setTgt(b);
  }); }, []);

  useEffect(() => {
    if (t.status === 'error') showErrorByCode(t.errorCode, t.errorMessage ?? '错误');
  }, [t.status, t.errorCode, t.errorMessage]);

  usePaste({
    onText: (s) => { setMode('text'); setText(s); },
    onImage: (f) => { setMode('image'); setFile(f); },
    onAudio: (f) => { setMode('audio'); setFile(f); },
  });

  function canSubmit(): boolean {
    if (mode === 'text') return text.trim().length > 0;
    return !!file;
  }

  async function submit() {
    if (!canSubmit()) return;
    if (mode === 'text') await t.run({ mode, sourceLang: src, targetLang: tgt, text });
    else if (file) await t.run({ mode, sourceLang: src, targetLang: tgt, bytes: file.bytes, mime: file.mime });
  }

  function onLangChange(next: { source: LangCode; target: LangCode }) {
    setSrc(next.source); setTgt(next.target);
    void ipc().settings.set({ languagePair: `${next.source}-${next.target}` });
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'Enter') void submit();
      else if (e.key === 'Escape' && t.status === 'streaming') void t.cancel();
      else if (e.ctrlKey && e.key.toLowerCase() === 'l') onLangChange({ source: tgt, target: src });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="p-6 flex flex-col gap-3 h-full overflow-auto">
      <div className="flex gap-3 items-center">
        <LangSwitch source={src} target={tgt} onChange={onLangChange} />
        <ModeTabs current={mode} onChange={setMode} />
      </div>

      {mode === 'text' && <TextInput value={text} onChange={setText} />}
      {mode === 'image' && <ImageInput onSelect={setFile} />}
      {mode === 'audio' && <AudioInput onSelect={setFile} />}

      <div className="flex gap-2">
        <button
          className="px-4 h-9 rounded-md bg-accent text-accent-fg disabled:opacity-50"
          disabled={!canSubmit() || t.status === 'streaming'}
          onClick={submit}
        >
          {t.status === 'streaming' ? '翻译中…' : '翻译'}
        </button>
        <button
          className="px-4 h-9 rounded-md border border-border text-fg"
          onClick={() => { setText(''); setFile(null); }}
        >
          清空
        </button>
      </div>

      <TranslationView
        text={t.text}
        status={t.status === 'idle' ? 'idle' : t.status}
        errorMessage={t.errorMessage}
        onCopy={() => void navigator.clipboard.writeText(t.text)}
        onFavorite={() => { if (t.id) void ipc().history.favorite(t.id, true); }}
        onRetranslate={() => void t.retry()}
      />
    </div>
  );
}
```

Mount `ToastHost` in App:

`src/App.tsx`:
```tsx
import { useTheme } from '@/hooks/useTheme';
import { AppShell } from '@/components/AppShell';
import { ToastHost } from '@/components/ui/Toast';

export default function App() {
  useTheme();
  return (
    <>
      <AppShell />
      <ToastHost />
    </>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- tests/use-translate.test.tsx
```
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTranslate.ts src/hooks/useErrorHandler.ts src/components/ui/Toast.tsx src/pages/Translate.tsx src/App.tsx tests/use-translate.test.tsx
git commit -m "feat: useTranslate + useErrorHandler + Translate page wiring"
```

---

## Task 20: History page

**Files:**
- Create: `src/components/history/HistoryList.tsx`
- Modify: `src/pages/History.tsx`

- [ ] **Step 1: HistoryList component**

`src/components/history/HistoryList.tsx`:
```tsx
import { useEffect, useState } from 'react';
import type { HistoryRecord } from '@shared/types';
import { ipc } from '@/lib/ipc';

export function HistoryList() {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  const [q, setQ] = useState('');
  const [favOnly, setFavOnly] = useState(false);

  async function reload() {
    const list = await ipc().history.list({ query: q || undefined, favoritesOnly: favOnly, limit: 200 });
    setItems(list);
  }

  useEffect(() => { void reload(); }, [q, favOnly]);

  async function clearAll() {
    if (!window.confirm('清空所有历史（包括收藏）？此操作不可撤销。')) return;
    await ipc().history.clear();
    void reload();
  }

  return (
    <div className="p-6 flex flex-col gap-3 h-full overflow-hidden">
      <div className="flex gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索原文/译文"
          className="flex-1 h-9 px-3 rounded-md border border-border bg-bg text-fg outline-none focus:border-accent" />
        <label className="text-sm text-muted flex items-center gap-1">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} /> 仅收藏
        </label>
        <button onClick={clearAll} className="px-3 h-9 rounded-md border border-border text-danger">清空</button>
      </div>
      <div className="flex-1 overflow-auto flex flex-col divide-y divide-border">
        {items.length === 0 ? (
          <div className="text-muted text-sm p-3">暂无记录</div>
        ) : (
          items.map((r) => (
            <div key={r.id} className="py-2 flex flex-col gap-1">
              <div className="text-xs text-muted">
                {new Date(r.createdAt).toLocaleString()} · {r.mode} · {r.sourceLang}→{r.targetLang}
                {r.favorite && <span className="ml-2 text-accent">★</span>}
              </div>
              {r.sourceText && <div className="text-sm text-muted line-clamp-2">{r.sourceText}</div>}
              <div className="text-sm text-fg line-clamp-3">{r.resultText}</div>
              <div className="flex gap-2 text-xs">
                <button className="text-muted hover:text-fg" onClick={() => void navigator.clipboard.writeText(r.resultText)}>复制</button>
                <button className="text-muted hover:text-fg" onClick={async () => { await ipc().history.favorite(r.id, !r.favorite); void reload(); }}>
                  {r.favorite ? '取消收藏' : '收藏'}
                </button>
                <button className="text-muted hover:text-danger" onClick={async () => { await ipc().history.delete(r.id); void reload(); }}>删除</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into History page**

`src/pages/History.tsx`:
```tsx
import { HistoryList } from '@/components/history/HistoryList';
export default function History() { return <HistoryList />; }
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```
Expected: history page lists entries (after running a translation in Translate page first).

- [ ] **Step 4: Commit**

```bash
git add src/components/history/HistoryList.tsx src/pages/History.tsx
git commit -m "feat: history page with search, favorites filter, clear"
```

---

## Task 21: Settings page

**Files:**
- Create: `src/components/settings/SettingsPanel.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `electron/main/ipc/settings.ts` (add `app:open-log-dir`, `app:show-window`)
- Modify: `electron/main/index.ts`

- [ ] **Step 1: SettingsPanel**

`src/components/settings/SettingsPanel.tsx`:
```tsx
import { useEffect, useState } from 'react';
import type { Settings, ThemeChoice } from '@shared/types';
import { ipc } from '@/lib/ipc';
import { pushToast } from '@/components/ui/Toast';

function maskKey(k: string): string {
  if (!k) return '未设置';
  return '••••••••' + k.slice(-4);
}

export function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [shortcutInput, setShortcutInput] = useState('');

  useEffect(() => { void ipc().settings.get().then((v) => { setS(v); setShortcutInput(v.shortcut); }); }, []);
  if (!s) return <div className="p-6 text-muted">加载中…</div>;

  async function update(patch: Partial<Settings>) {
    const next = await ipc().settings.set(patch);
    setS(next);
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-xl">
      <section className="flex flex-col gap-2">
        <h2 className="text-fg text-lg">API key</h2>
        {editingKey ? (
          <div className="flex gap-2">
            <input
              type="password" autoFocus
              className="flex-1 h-9 px-3 rounded-md border border-border bg-bg text-fg outline-none focus:border-accent"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="粘贴 Gemini API key"
            />
            <button className="px-3 h-9 rounded-md bg-accent text-accent-fg" onClick={async () => {
              await update({ apiKey: keyInput });
              setEditingKey(false); setKeyInput('');
              pushToast('API key 已保存');
            }}>保存</button>
            <button className="px-3 h-9 rounded-md border border-border text-fg" onClick={() => { setEditingKey(false); setKeyInput(''); }}>取消</button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-fg">{maskKey(s.apiKey)}</code>
            <button className="px-3 h-9 rounded-md border border-border text-fg" onClick={() => setEditingKey(true)}>更换 key</button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-fg text-lg">主题</h2>
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as ThemeChoice[]).map((t) => (
            <button key={t}
              className={`px-3 h-9 rounded-md border ${s.theme === t ? 'border-accent text-fg' : 'border-border text-muted'}`}
              onClick={() => void update({ theme: t })}
            >
              {t === 'dark' ? '暗色' : t === 'light' ? '亮色' : '跟随系统'}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-fg text-lg">全局快捷键</h2>
        <div className="flex gap-2">
          <input
            value={shortcutInput} onChange={(e) => setShortcutInput(e.target.value)}
            className="flex-1 h-9 px-3 rounded-md border border-border bg-bg text-fg outline-none focus:border-accent"
            placeholder="如 Ctrl+Shift+T"
          />
          <button className="px-3 h-9 rounded-md bg-accent text-accent-fg" onClick={async () => {
            await update({ shortcut: shortcutInput });
            pushToast('快捷键已更新（重启应用生效）');
          }}>保存</button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-fg text-lg">历史上限</h2>
        <input type="number" min={10} max={2000}
          value={s.history.maxRecords}
          className="w-32 h-9 px-3 rounded-md border border-border bg-bg text-fg outline-none focus:border-accent"
          onChange={(e) => void update({ history: { maxRecords: Math.max(10, Math.min(2000, Number(e.target.value) || 200)) } })}
        />
      </section>

      <section>
        <button className="px-3 h-9 rounded-md border border-border text-fg"
          onClick={() => void ipc().app.openLogDir()}>打开日志目录</button>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Add app IPC handlers**

Modify `electron/main/ipc/settings.ts`:
```ts
import { app, ipcMain, shell, BrowserWindow } from 'electron';
import path from 'node:path';
import { loadSettings, saveSettings } from '../services/secret-store';
import type { Settings } from '@shared/types';

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => { saveSettings(patch); return loadSettings(); });
  ipcMain.handle('app:open-log-dir', () => {
    void shell.openPath(path.join(app.getPath('userData'), 'logs'));
    return { ok: true };
  });
  ipcMain.handle('app:show-window', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
    return { ok: true };
  });
}
```

- [ ] **Step 3: Wire Settings page**

`src/pages/Settings.tsx`:
```tsx
import { SettingsPanel } from '@/components/settings/SettingsPanel';
export default function Settings() { return <SettingsPanel />; }
```

- [ ] **Step 4: Smoke**

```bash
npm run dev
```
Expected: settings page accepts API key, theme switch is live, log dir button opens folder.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx src/pages/Settings.tsx electron/main/ipc/settings.ts
git commit -m "feat: settings page (API key, theme, shortcut, history cap, log dir)"
```

---

## Task 22: Tray + global shortcut + close-to-tray

**Files:**
- Create: `electron/main/tray.ts`
- Create: `electron/main/shortcuts.ts`
- Create: `electron/main/window.ts` modifications (close-to-tray)
- Create: `assets/tray-icon.png` (16x16 or 32x32; supplied by repo author or generated as a simple solid square if unavailable)
- Modify: `electron/main/index.ts`

- [ ] **Step 1: Tray icon asset**

Create `assets/tray-icon.png`. If you don't have one, generate a 16×16 PNG: a solid `#4f8cff` square with a white "T" centered. Any PNG of that size works.

- [ ] **Step 2: tray.ts**

`electron/main/tray.ts`:
```ts
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
```

- [ ] **Step 3: shortcuts.ts**

`electron/main/shortcuts.ts`:
```ts
import { globalShortcut } from 'electron';

export function registerGlobalShortcut(accelerator: string, action: () => void): boolean {
  globalShortcut.unregisterAll();
  if (!accelerator) return false;
  return globalShortcut.register(accelerator, action);
}
```

- [ ] **Step 4: Modify window.ts to close-to-tray**

Modify `electron/main/window.ts` — replace existing file:
```ts
import { BrowserWindow, nativeTheme, app } from 'electron';
import path from 'node:path';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 720, minHeight: 520,
    show: false, frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e1116' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  });

  if (process.env['VITE_DEV_SERVER_URL']) void win.loadURL(process.env['VITE_DEV_SERVER_URL']);
  else void win.loadFile(path.join(__dirname, '../../dist/index.html'));

  win.once('ready-to-show', () => win.show());

  win.on('close', (e) => {
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  return win;
}
```

- [ ] **Step 5: Wire all into main index**

Replace `electron/main/index.ts`:
```ts
import { app, BrowserWindow, nativeTheme, clipboard } from 'electron';
import { createMainWindow } from './window';
import { registerSettingsIpc } from './ipc/settings';
import { registerHistoryIpc, startupCleanup } from './ipc/history';
import { registerTranslateIpc } from './ipc/translate';
import { loadSettings } from './services/secret-store';
import { createTray } from './tray';
import { registerGlobalShortcut } from './shortcuts';

let mainWindow: BrowserWindow | null = null;

function showMain(): void {
  if (!mainWindow) mainWindow = createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('app:focus-input', {});
}

function quickTranslateClipboard(): void {
  const text = clipboard.readText();
  if (!text) return;
  showMain();
  // Renderer reads window event below
  mainWindow?.webContents.send('app:quick-translate', { text });
}

app.whenReady().then(() => {
  registerSettingsIpc();
  registerHistoryIpc();
  registerTranslateIpc();
  startupCleanup(loadSettings().history.maxRecords);

  mainWindow = createMainWindow();
  createTray(() => mainWindow, quickTranslateClipboard);

  registerGlobalShortcut(loadSettings().shortcut, showMain);

  nativeTheme.on('updated', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('theme:system-changed', { isDark: nativeTheme.shouldUseDarkColors });
    }
  });
});

app.on('window-all-closed', (e) => { e.preventDefault(); /* keep alive in tray */ });
app.on('before-quit', () => { (app as unknown as { isQuitting: boolean }).isQuitting = true; });
app.on('will-quit', () => { /* unregister */ });
```

- [ ] **Step 6: Renderer listens for `app:focus-input` and `app:quick-translate`**

Add to `electron/preload.ts`, inside `api.app`:
```ts
onFocusInput: (cb: () => void) => {
  const wrap = () => cb();
  ipcRenderer.on('app:focus-input', wrap);
  return () => ipcRenderer.off('app:focus-input', wrap);
},
onQuickTranslate: (cb: (e: { text: string }) => void) => {
  const wrap = (_: unknown, e: { text: string }) => cb(e);
  ipcRenderer.on('app:quick-translate', wrap);
  return () => ipcRenderer.off('app:quick-translate', wrap);
},
```

In `src/pages/Translate.tsx`, add at the top of component body:
```tsx
useEffect(() => {
  const off1 = window.electron.app.onFocusInput(() => {
    document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  });
  const off2 = window.electron.app.onQuickTranslate(({ text }) => {
    setMode('text'); setText(text);
  });
  return () => { off1(); off2(); };
}, []);
```

- [ ] **Step 7: Smoke**

```bash
npm run dev
```
Expected: tray icon appears; Ctrl+Shift+T from anywhere brings window to front; clicking close hides instead of quitting; "Quit" in tray menu actually exits.

- [ ] **Step 8: Commit**

```bash
git add electron/main/tray.ts electron/main/shortcuts.ts electron/main/window.ts electron/main/index.ts electron/preload.ts src/pages/Translate.tsx assets/
git commit -m "feat: system tray, global shortcut, close-to-tray, quick clipboard translate"
```

---

## Task 23: Logging (electron-log) + error forwarding

**Files:**
- Create: `electron/main/logger.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/main/ipc/translate.ts` (log mapped errors detail)
- Modify: `src/main.tsx` (forward window errors)
- Modify: `electron/preload.ts` (expose `log:write` channel)

- [ ] **Step 1: logger.ts**

`electron/main/logger.ts`:
```ts
import log from 'electron-log/main';
import path from 'node:path';
import { app } from 'electron';

export function initLogger(): void {
  log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', `app-${new Date().toISOString().slice(0, 10)}.log`);
  log.transports.file.level = 'info';
  log.transports.console.level = 'debug';
  log.errorHandler.startCatching({ showDialog: false });
}

export const logger = log;
```

- [ ] **Step 2: Initialize early in main**

Modify `electron/main/index.ts` — at top, before `whenReady`:
```ts
import { initLogger, logger } from './logger';
initLogger();
```

In handlers, sprinkle `logger.info` / `logger.error` calls. In `electron/main/ipc/translate.ts`, log mapped errors:

Replace the catch block's first lines:
```ts
} catch (err) {
  const m = mapSdkError(err);
  logger.error('translate failed', payload.id, m.code, m.detail);
  ...
```

(Add `import { logger } from '../logger';` at top.)

- [ ] **Step 3: Forward renderer errors**

Add to `electron/preload.ts`:
```ts
log: {
  warn: (msg: string) => ipcRenderer.send('log:warn', msg),
  error: (msg: string) => ipcRenderer.send('log:error', msg),
},
```

Add IPC listeners in `electron/main/index.ts` (inside `whenReady`):
```ts
import { ipcMain } from 'electron';
ipcMain.on('log:warn', (_e, msg: string) => logger.warn('[renderer]', msg));
ipcMain.on('log:error', (_e, msg: string) => logger.error('[renderer]', msg));
```

In `src/main.tsx`, add global error forwarders before render:
```tsx
window.addEventListener('error', (e) => window.electron.log?.error?.(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => window.electron.log?.error?.(`unhandled promise: ${String(e.reason)}`));
```

- [ ] **Step 4: Smoke**

```bash
npm run dev
```
Trigger a translation, then check `%APPDATA%\llm-translate\logs\app-YYYY-MM-DD.log` exists with at least one entry.

- [ ] **Step 5: Commit**

```bash
git add electron/main/logger.ts electron/main/index.ts electron/main/ipc/translate.ts electron/preload.ts src/main.tsx
git commit -m "feat: electron-log + renderer error forwarding"
```

---

## Task 24: Playwright E2E (5 main paths)

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/helpers.ts`
- Create: `e2e/translate.spec.ts`, `theme.spec.ts`, `image-paste.spec.ts`, `tray.spec.ts`
- Modify: `package.json` if needed

- [ ] **Step 1: Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
```

- [ ] **Step 2: Helpers — launch Electron with stub Gemini**

`e2e/helpers.ts`:
```ts
import { _electron, type ElectronApplication, type Page } from 'playwright';
import path from 'node:path';

export async function launchApp(env: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await _electron.launch({
    args: [path.join(__dirname, '..', 'dist-electron', 'main', 'index.js')],
    env: { ...process.env, ...env, NODE_ENV: 'test' },
  });
  const page = await app.firstWindow();
  return { app, page };
}
```

- [ ] **Step 3: Build before E2E**

Add to `package.json` scripts:
```json
"e2e:build": "tsc -p electron/tsconfig.json && vite build",
"e2e": "npm run e2e:build && playwright test"
```

- [ ] **Step 4: Stub Gemini for E2E**

For deterministic tests, gate the Gemini service to use a fake stream when `process.env.NODE_ENV === 'test'`. Modify `electron/main/services/gemini.ts` `streamTranslate` top:
```ts
export async function streamTranslate(opts: StreamTranslateOptions): Promise<StreamResult> {
  if (process.env['NODE_ENV'] === 'test') {
    const chunks = ['hel', 'lo ', 'world'];
    let full = '';
    for (const c of chunks) {
      if (opts.signal.aborted) throw Object.assign(new Error('abort'), { name: 'AbortError' });
      full += c;
      opts.onChunk(c);
      await new Promise((r) => setTimeout(r, 30));
    }
    return { fullText: full };
  }
  // ... existing real implementation
}
```

- [ ] **Step 5: Test 1 — first run + text translation**

`e2e/translate.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';

test('first-run set api key, translate text, history populated', async () => {
  const { app, page } = await launchApp();
  // Settings: open and set API key
  await page.getByText('设置').click();
  await page.getByText('更换 key').click();
  await page.getByPlaceholder('粘贴 Gemini API key').fill('test-key');
  await page.getByRole('button', { name: '保存' }).first().click();
  // Back to translate
  await page.getByText('翻译').click();
  await page.getByPlaceholder(/输入要翻译的文字/).fill('你好');
  await page.getByRole('button', { name: /翻译/ }).click();
  await expect(page.getByText('hello world')).toBeVisible({ timeout: 10000 });
  // History
  await page.getByText('历史').click();
  await expect(page.getByText('你好').first()).toBeVisible();
  await app.close();
});
```

- [ ] **Step 6: Test 2 — language switch**

Add to `e2e/translate.spec.ts`:
```ts
test('language switch reverses direction', async () => {
  const { app, page } = await launchApp();
  await page.getByText('设置').click();
  await page.getByText('更换 key').click();
  await page.getByPlaceholder('粘贴 Gemini API key').fill('k');
  await page.getByRole('button', { name: '保存' }).first().click();
  await page.getByText('翻译').click();
  const button = page.getByRole('button', { name: /中.*→.*英/ });
  await button.click();
  await expect(page.getByRole('button', { name: /英.*→.*中/ })).toBeVisible();
  await app.close();
});
```

- [ ] **Step 7: Test 3 — image paste / drop**

`e2e/image-paste.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';
import path from 'node:path';
import fs from 'node:fs';

test('drop image switches to image mode and translates', async () => {
  const { app, page } = await launchApp();
  await page.getByText('设置').click();
  await page.getByText('更换 key').click();
  await page.getByPlaceholder('粘贴 Gemini API key').fill('k');
  await page.getByRole('button', { name: '保存' }).first().click();
  await page.getByText('翻译').click();
  await page.getByRole('tab', { name: '图片' }).click();
  // Use file chooser instead of drop for stability
  const fixture = path.join(__dirname, 'fixture.png');
  if (!fs.existsSync(fixture)) fs.writeFileSync(fixture, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); // PNG header
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('image-dropzone').click(),
  ]);
  await chooser.setFiles(fixture);
  await page.getByRole('button', { name: /翻译/ }).click();
  await expect(page.getByText('hello world')).toBeVisible({ timeout: 10000 });
  await app.close();
});
```

- [ ] **Step 8: Test 4 — theme switching**

`e2e/theme.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';

test('theme dark / light / system updates data-theme', async () => {
  const { app, page } = await launchApp();
  await page.getByText('设置').click();
  await page.getByRole('button', { name: '亮色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '暗色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await app.close();
});
```

- [ ] **Step 9: Test 5 — close to tray (manual portion)**

Tray + global shortcut hand-off: stamp a placeholder describing manual test, since CI cannot exercise OS chrome reliably:

`e2e/tray.spec.ts`:
```ts
import { test } from '@playwright/test';
test.skip('tray + global shortcut: covered by manual verification (see spec §7.6)', () => undefined);
```

- [ ] **Step 10: Run E2E**

```bash
npm run e2e
```
Expected: 4 specs pass, 1 skipped.

- [ ] **Step 11: Commit**

```bash
git add playwright.config.ts e2e/ package.json electron/main/services/gemini.ts
git commit -m "test: e2e coverage for translate/lang/image/theme paths"
```

---

## Task 25: Packaging (electron-builder) + CI

**Files:**
- Create: `electron-builder.json`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` `build` field if needed

- [ ] **Step 1: electron-builder config**

`electron-builder.json`:
```json
{
  "appId": "com.zhangshaojie.llmtranslate",
  "productName": "llmTranslate",
  "directories": { "output": "release" },
  "files": [
    "dist/**",
    "dist-electron/**",
    "assets/**",
    "package.json"
  ],
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64"] },
      { "target": "portable", "arch": ["x64"] }
    ],
    "icon": "assets/tray-icon.png"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "perMachine": false
  }
}
```

- [ ] **Step 2: GitHub Actions CI**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push: { branches: [main, master] }
  pull_request:
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm run e2e
      - if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
        run: npm run package
      - if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
        uses: actions/upload-artifact@v4
        with:
          name: llmTranslate-windows
          path: release/*.exe
```

- [ ] **Step 3: Local package smoke**

```bash
npm run package
```
Expected: `release/llmTranslate Setup *.exe` and `release/llmTranslate *.exe` (portable) produced.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.json .github/
git commit -m "chore: electron-builder config + CI workflow"
```

---

## Spec coverage check

| Spec section | Covered by tasks |
|---|---|
| §2.1 process model + safety prefs | T3, T22 (window factory) |
| §2.2 directory layout | T1–T22 cumulative |
| §2.3 dependencies | T1 |
| §3.1 main window layout | T14 (shell) + T19 (translate page) |
| §3.2 component clinic | T14, T15–T17, T19, T20, T21 |
| §3.3 theme system (CSS variables) | T2 (tokens) + T13 (apply/resolve) |
| §3.4 tray + global shortcut | T22 |
| §3.5 in-app keyboard | T19 (Ctrl+Enter, Esc, Ctrl+L) |
| §4.1–4.2 translate data flow + cancel | T11 (translate IPC) + T19 (useTranslate) |
| §4.3 IPC channel list (incl. accepted/reject split) | T11 + T12 |
| §5.1 safeStorage encryption | T6 |
| §5.2 settings file | T6 |
| §5.3 SQLite + FTS schema | T7 |
| §5.4 asset files + capacity | T7 + T10 (startup cleanup) |
| §5.5 renderer security (CSP, contextIsolation) | T2 (HTML CSP) + T3 (window webPreferences) + T12 (preload) |
| §6.1–6.2 error taxonomy + shape | T5 (types) + T8 (mapSdkError) + T11 (forwarding) |
| §6.3 input validation | T11 (validatePayload) + T16 (front-end checks) |
| §6.4 logging | T23 |
| §6.5 retry behavior | T19 (retry callback in useTranslate) |
| §6.6 DB integrity + orphan cleanup | T7 (integrityOk) + T10 (startupCleanup) |
| §7 testing strategy | T4 (infra) + per-task unit/integration tests + T24 (E2E) |
| §8 out-of-scope | not implemented (intentional) |

No gaps detected.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-01-llm-translate.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach do you prefer?
