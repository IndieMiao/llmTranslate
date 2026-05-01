# History as Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the History page's divided list with a card grid; clicking a card opens a modal with the full translation, source text, and (for image entries) the original image served via a sandboxed IPC.

**Architecture:** A new `HistoryCard` renders compact metadata + translation preview; `HistoryDetailModal` renders the full record and lazily fetches the image via a new `history:read-asset` IPC that returns a base64 data URL only for paths inside the app's `assets/` directory. Markdown component maps shared by the input view and history are extracted into one module so they don't drift.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, react-markdown + remark-gfm, Electron 32 IPC, better-sqlite3, vitest + @testing-library/react.

---

## Reference: spec

`docs/superpowers/specs/2026-05-01-history-cards-design.md`

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/components/markdown/components.tsx` | **New** | Exports `mdCompact` (inline-only, used in cards) and `mdRich` (block, used in TranslationView + modal). |
| `src/components/translate/TranslationView.tsx` | **Modified** | Imports `mdRich` from new module instead of defining `md` locally. |
| `src/components/history/HistoryCard.tsx` | **New** | One card: timestamp, mode/lang header, source preview (line-clamp-2), translation preview (line-clamp-3), footer actions. |
| `src/components/history/HistoryDetailModal.tsx` | **New** | Full record modal: header, image (lazy via IPC) + Lightbox, audio filename, source block, full markdown translation, footer actions. |
| `src/components/history/HistoryList.tsx` | **Modified** | Replaces divided list with responsive grid; owns `selected` state for the modal; re-derives `selected` after `reload()`. |
| `shared/types.ts` | **Modified** | Adds `HistoryAssetReadResult`. |
| `electron/preload.ts` | **Modified** | Exposes `history.readAsset(id)`. |
| `electron/main/services/history-db.ts` | **Modified** | Adds `getAssetById(id)` method to the `HistoryDb` interface and implementation. |
| `electron/main/ipc/history.ts` | **Modified** | Adds `history:read-asset` handler with path sandboxing. |
| `tests/markdown-components.test.tsx` | **New** | mdCompact / mdRich render the expected DOM. |
| `tests/history-card.test.tsx` | **New** | Card rendering and click semantics. |
| `tests/history-detail-modal.test.tsx` | **New** | Modal rendering, ESC, asset fetch. |
| `tests/history-db.test.ts` | **Modified** | Add `getAssetById` cases. |
| `tests/ipc-history.test.ts` | **Modified** | Add `history:read-asset` happy / missing / traversal cases. |

---

## Task 1: Extract shared markdown component maps

**Why first:** Both the new card and the new modal depend on the maps. Centralizing them now avoids duplicating two more copies later.

**Files:**
- Create: `src/components/markdown/components.tsx`
- Create: `tests/markdown-components.test.tsx`
- Modify: `src/components/translate/TranslationView.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/markdown-components.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { mdCompact, mdRich } from '@/components/markdown/components';

describe('markdown components', () => {
  it('mdRich renders a paragraph element', () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdRich as never}>
        hello
      </ReactMarkdown>,
    );
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('mdCompact renders a list item as inline span (not <li>)', () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdCompact as never}>
        {'- item'}
      </ReactMarkdown>,
    );
    expect(container.querySelector('li')).toBeNull();
    expect(container.textContent).toContain('item');
  });

  it('mdRich renders headings', () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdRich as never}>
        {'# big'}
      </ReactMarkdown>,
    );
    expect(container.querySelector('h1')?.textContent).toBe('big');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/markdown-components.test.tsx`
Expected: FAIL — module `@/components/markdown/components` cannot be found.

- [ ] **Step 3: Create the shared module**

Create `src/components/markdown/components.tsx`. The file exports two `Components` maps. `mdCompact` matches the existing inline-only map currently in `HistoryList.tsx`; `mdRich` matches the existing block map currently in `TranslationView.tsx`.

```tsx
import type { Components } from 'react-markdown';

type ChildrenProps = { children?: React.ReactNode };
type CodeProps = { inline?: boolean; children?: React.ReactNode };
type AnchorProps = { href?: string; children?: React.ReactNode };

export const mdCompact: Components = {
  p: (p: ChildrenProps) => <span>{p.children}</span>,
  strong: (p: ChildrenProps) => <strong className="font-semibold">{p.children}</strong>,
  em: (p: ChildrenProps) => <em className="italic">{p.children}</em>,
  ul: (p: ChildrenProps) => <span>{p.children}</span>,
  ol: (p: ChildrenProps) => <span>{p.children}</span>,
  li: (p: ChildrenProps) => (
    <span className="block before:content-['•'] before:mr-1.5">{p.children}</span>
  ),
  h1: (p: ChildrenProps) => <span className="font-bold">{p.children}</span>,
  h2: (p: ChildrenProps) => <span className="font-bold">{p.children}</span>,
  h3: (p: ChildrenProps) => <span className="font-bold">{p.children}</span>,
  blockquote: (p: ChildrenProps) => <span className="text-muted italic">{p.children}</span>,
  code: ({ inline, children }: CodeProps) =>
    inline === false ? (
      <span className="text-xs font-mono">{children}</span>
    ) : (
      <code className="px-1 rounded bg-[color:var(--border)] font-mono text-xs">{children}</code>
    ),
  pre: (p: ChildrenProps) => <span className="text-xs font-mono">{p.children}</span>,
  a: (p: ChildrenProps) => <span>{p.children}</span>,
  hr: () => <span className="mx-1 text-muted">---</span>,
  table: (p: ChildrenProps) => <span>{p.children}</span>,
  th: (p: ChildrenProps) => <span className="font-semibold">{p.children}</span>,
  td: (p: ChildrenProps) => <span>{p.children}</span>,
};

export const mdRich: Components = {
  p: (p: ChildrenProps) => (
    <p className="my-3 first:mt-0 last:mb-0 leading-7 text-base">{p.children}</p>
  ),
  strong: (p: ChildrenProps) => (
    <strong className="font-semibold text-fg">{p.children}</strong>
  ),
  em: (p: ChildrenProps) => <em className="italic text-fg">{p.children}</em>,
  ul: (p: ChildrenProps) => (
    <ul className="list-disc list-outside pl-6 my-3 space-y-2">{p.children}</ul>
  ),
  ol: (p: ChildrenProps) => (
    <ol className="list-decimal list-outside pl-6 my-3 space-y-2">{p.children}</ol>
  ),
  li: (p: ChildrenProps) => <li className="leading-7 text-base pl-1">{p.children}</li>,
  h1: (p: ChildrenProps) => (
    <h1 className="text-xl font-bold mt-5 mb-3 text-fg leading-8">{p.children}</h1>
  ),
  h2: (p: ChildrenProps) => (
    <h2 className="text-lg font-bold mt-4 mb-2 text-fg leading-7">{p.children}</h2>
  ),
  h3: (p: ChildrenProps) => (
    <h3 className="text-base font-bold mt-3 mb-1.5 text-fg leading-7">{p.children}</h3>
  ),
  blockquote: (p: ChildrenProps) => (
    <blockquote className="border-l-[3px] border-accent pl-4 py-1 my-3 text-muted italic leading-7">
      {p.children}
    </blockquote>
  ),
  code: ({ inline, children }: CodeProps) =>
    inline === false ? (
      <code className="block">{children}</code>
    ) : (
      <code className="px-1.5 py-0.5 rounded bg-[color:var(--border)] text-fg font-mono text-sm">
        {children}
      </code>
    ),
  pre: (p: ChildrenProps) => (
    <pre className="my-3 p-4 rounded-lg bg-[color:var(--border)] overflow-x-auto text-sm font-mono leading-6">
      {p.children}
    </pre>
  ),
  a: (p: AnchorProps) => (
    <a
      href={p.href}
      className="text-accent underline hover:no-underline"
      onClick={(e) => e.preventDefault()}
    >
      {p.children}
    </a>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: (p: ChildrenProps) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{p.children}</table>
    </div>
  ),
  th: (p: ChildrenProps) => (
    <th className="border border-border px-3 py-2 text-left font-semibold bg-[color:var(--border)] text-fg">
      {p.children}
    </th>
  ),
  td: (p: ChildrenProps) => (
    <td className="border border-border px-3 py-2">{p.children}</td>
  ),
};
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/markdown-components.test.tsx`
Expected: PASS — all 3 cases.

- [ ] **Step 5: Switch `TranslationView` to import `mdRich`**

Edit `src/components/translate/TranslationView.tsx`. Remove the local `md` const (lines 15-76 in current file) and replace its usage on line 86. The whole top of the file becomes:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { mdRich } from '@/components/markdown/components';

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
    <div className="border border-border rounded-lg p-5 min-h-[120px] flex flex-col gap-2">
      {status === 'error' ? (
        <div className="text-danger text-sm">{errorMessage}</div>
      ) : (
        <div className="text-fg break-words">
          {text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdRich as never}>
              {text}
            </ReactMarkdown>
          ) : null}
          {status === 'streaming' && (
            <span
              data-testid="caret"
              className="inline-block w-2 h-4 align-middle bg-accent ml-0.5 animate-pulse"
            />
          )}
          {status === 'cancelled' && <span className="ml-2 text-xs text-muted">[已取消]</span>}
        </div>
      )}
      {status === 'ok' && (
        <div className="flex gap-3 mt-2 pt-2 border-t border-border">
          <button className="text-xs text-muted hover:text-fg transition-colors" onClick={onCopy}>
            复制
          </button>
          <button className="text-xs text-muted hover:text-fg transition-colors" onClick={onFavorite}>
            收藏
          </button>
          <button className="text-xs text-muted hover:text-fg transition-colors" onClick={onRetranslate}>
            重新翻译
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify existing translation-view tests still pass**

Run: `npm test -- tests/translation-view.test.tsx tests/markdown-components.test.tsx`
Expected: PASS for both files.

- [ ] **Step 7: Commit**

```bash
git add src/components/markdown/components.tsx src/components/translate/TranslationView.tsx tests/markdown-components.test.tsx
git commit -m "refactor(markdown): extract shared mdCompact and mdRich component maps"
```

---

## Task 2: Add `getAssetById` to the history DB

**Files:**
- Modify: `electron/main/services/history-db.ts`
- Modify: `tests/history-db.test.ts`

- [ ] **Step 1: Read the existing test file to match conventions**

Run: `cat tests/history-db.test.ts` (or open the file). Note the existing setup: it instantiates `openHistoryDb` against a tmp file and inserts records via `insert`.

- [ ] **Step 2: Write the failing test**

Append to `tests/history-db.test.ts`:

```ts
it('getAssetById returns asset_path and mode for the record', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdb-'));
  const db = openHistoryDb(path.join(dir, 'h.db'));
  db.insert({
    id: 'r1', createdAt: 1, mode: 'image', sourceLang: 'zh', targetLang: 'en',
    sourceText: null, resultText: 'hello', assetPath: '/tmp/x.png', favorite: false, tokenUsage: null,
  });
  expect(db.getAssetById('r1')).toEqual({ assetPath: '/tmp/x.png', mode: 'image' });
  db.close();
});

it('getAssetById returns null for unknown id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdb-'));
  const db = openHistoryDb(path.join(dir, 'h.db'));
  expect(db.getAssetById('missing')).toBeNull();
  db.close();
});
```

If the test file does not already import `os`/`path`/`fs`, add them at the top. (Look at how the file's other tests construct a temp DB and reuse that pattern.)

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm test -- tests/history-db.test.ts`
Expected: FAIL — `db.getAssetById is not a function`.

- [ ] **Step 4: Add the method to the interface and implementation**

Edit `electron/main/services/history-db.ts`. Add to the `HistoryDb` interface (around line 49, after `listAllAssetPaths`):

```ts
  getAssetById(id: string): { assetPath: string | null; mode: HistoryRecord['mode'] } | null;
```

Add the implementation in the returned object (e.g. between `listAllAssetPaths` and `integrityOk`):

```ts
    getAssetById(id) {
      const row = db
        .prepare('SELECT asset_path, mode FROM translations WHERE id = ?')
        .get(id) as { asset_path: string | null; mode: string } | undefined;
      if (!row) return null;
      return { assetPath: row.asset_path, mode: row.mode as HistoryRecord['mode'] };
    },
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- tests/history-db.test.ts`
Expected: PASS — including the two new cases.

- [ ] **Step 6: Commit**

```bash
git add electron/main/services/history-db.ts tests/history-db.test.ts
git commit -m "feat(history-db): add getAssetById lookup"
```

---

## Task 3: Add shared `HistoryAssetReadResult` type

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add the type**

Append to `shared/types.ts` (after the `HistoryListQuery` block):

```ts
export interface HistoryAssetReadResult {
  mime: string;
  dataUrl: string; // "data:<mime>;base64,..."
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): add HistoryAssetReadResult"
```

---

## Task 4: Add `history:read-asset` IPC handler

**Files:**
- Modify: `electron/main/ipc/history.ts`
- Modify: `tests/ipc-history.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the body of `tests/ipc-history.test.ts` so it covers the new cases. Keep the existing happy-path test, then add three new ones:

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

    // Place a real PNG byte sequence inside the asset dir.
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
    const filePath = path.join(assetDir, '2026', '05', 'gone.png'); // never created
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

    // Create a real file outside the asset dir to rule out a false negative
    // from the existence check masking the sandbox check.
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
```

- [ ] **Step 2: Run the tests and verify the new ones fail**

Run: `npm test -- tests/ipc-history.test.ts`
Expected: existing test passes; the 4 new cases FAIL with `handlers.get('history:read-asset') is undefined` (or similar).

- [ ] **Step 3: Add a `mimeFromExt` helper**

Add to `electron/main/ipc/history.ts` (top-level, below the imports):

```ts
function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    case '.ogg': return 'audio/ogg';
    default: return 'application/octet-stream';
  }
}
```

- [ ] **Step 4: Register the handler**

Add to `registerHistoryIpc()` in `electron/main/ipc/history.ts`, alongside the other handlers:

```ts
  ipcMain.handle('history:read-asset', (_e, p: { id: string }) => {
    const row = getDb().getAssetById(p.id);
    if (!row?.assetPath) return null;

    const dir = path.resolve(getAssetDir());
    const resolved = path.resolve(row.assetPath);
    const inside = resolved === dir || resolved.startsWith(dir + path.sep);
    if (!inside) return null;

    if (!fs.existsSync(resolved)) return null;

    const bytes = fs.readFileSync(resolved);
    const mime = mimeFromExt(path.extname(resolved));
    return { mime, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
  });
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test -- tests/ipc-history.test.ts`
Expected: PASS — all 5 cases.

- [ ] **Step 6: Commit**

```bash
git add electron/main/ipc/history.ts tests/ipc-history.test.ts
git commit -m "feat(history): add sandboxed history:read-asset IPC"
```

---

## Task 5: Expose `readAsset` in preload

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add the import**

In `electron/preload.ts`, change the existing shared-types import (line 2-5) to also include `HistoryAssetReadResult`:

```ts
import type {
  TranslateRunPayload, TranslateChunkEvent, TranslateDoneEvent, TranslateErrorEvent,
  Settings, HistoryListQuery, HistoryRecord, HistoryAssetReadResult,
} from '../shared/types';
```

- [ ] **Step 2: Add the bridge method**

Inside the `history:` block of `api`, add the method below `favorite` (line 37):

```ts
    readAsset: (id: string): Promise<HistoryAssetReadResult | null> =>
      ipcRenderer.invoke('history:read-asset', { id }),
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(preload): expose history.readAsset"
```

---

## Task 6: HistoryCard component

**Files:**
- Create: `src/components/history/HistoryCard.tsx`
- Create: `tests/history-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/history-card.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryCard } from '@/components/history/HistoryCard';
import type { HistoryRecord } from '@shared/types';

const favoriteMock = vi.fn(async () => ({ ok: true }));
const deleteMock = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  favoriteMock.mockClear();
  deleteMock.mockClear();
  // @ts-expect-error stub global
  window.electron = {
    history: {
      favorite: favoriteMock,
      delete: deleteMock,
    },
  };
  // @ts-expect-error stub clipboard
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  // jsdom does not implement window.confirm — assume confirmed
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function rec(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'r1',
    createdAt: new Date('2026-05-01T08:30:00Z').getTime(),
    mode: 'text',
    sourceLang: 'zh',
    targetLang: 'en',
    sourceText: '你好世界',
    resultText: 'Hello world',
    assetPath: null,
    favorite: false,
    tokenUsage: null,
    ...over,
  };
}

describe('HistoryCard', () => {
  it('renders mode, languages, source preview, translation preview', () => {
    render(<HistoryCard record={rec()} onOpen={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText(/text/)).toBeInTheDocument();
    expect(screen.getByText(/zh→en/)).toBeInTheDocument();
    expect(screen.getByText('你好世界')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows ★ when favorite', () => {
    render(<HistoryCard record={rec({ favorite: true })} onOpen={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText('★')).toBeInTheDocument();
  });

  it('does not show ★ when not favorite', () => {
    render(<HistoryCard record={rec({ favorite: false })} onOpen={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByText('★')).toBeNull();
  });

  it('clicking the card body calls onOpen with the record', async () => {
    const onOpen = vi.fn();
    render(<HistoryCard record={rec()} onOpen={onOpen} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByTestId('history-card-body'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('r1');
  });

  it('clicking footer buttons does not call onOpen', async () => {
    const onOpen = vi.fn();
    render(<HistoryCard record={rec()} onOpen={onOpen} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '复制' }));
    await userEvent.click(screen.getByRole('button', { name: '收藏' }));
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('clicking 收藏 toggles via ipc and calls onChanged', async () => {
    const onChanged = vi.fn();
    render(<HistoryCard record={rec({ favorite: false })} onOpen={vi.fn()} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole('button', { name: '收藏' }));
    expect(favoriteMock).toHaveBeenCalledWith('r1', true);
    expect(onChanged).toHaveBeenCalled();
  });

  it('clicking 取消收藏 sends favorite=false', async () => {
    render(<HistoryCard record={rec({ favorite: true })} onOpen={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '取消收藏' }));
    expect(favoriteMock).toHaveBeenCalledWith('r1', false);
  });

  it('image-mode card without sourceText omits the source preview row', () => {
    render(
      <HistoryCard
        record={rec({ mode: 'image', sourceText: null, assetPath: '/x.png' })}
        onOpen={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('history-card-source')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/history-card.test.tsx`
Expected: FAIL — module `@/components/history/HistoryCard` not found.

- [ ] **Step 3: Implement the component**

Create `src/components/history/HistoryCard.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { HistoryRecord } from '@shared/types';
import { ipc } from '@/lib/ipc';
import { mdCompact } from '@/components/markdown/components';

interface Props {
  record: HistoryRecord;
  onOpen: (record: HistoryRecord) => void;
  onChanged: () => void;
}

export function HistoryCard({ record, onOpen, onChanged }: Props) {
  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(record.resultText);
  }

  async function toggleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    await ipc().history.favorite(record.id, !record.favorite);
    onChanged();
  }

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('删除这条历史？')) return;
    await ipc().history.delete(record.id);
    onChanged();
  }

  return (
    <div
      data-testid="history-card-body"
      className="border border-border rounded-lg p-3 cursor-pointer hover:border-accent hover:shadow-sm transition-colors flex flex-col gap-2"
      onClick={() => onOpen(record)}
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {new Date(record.createdAt).toLocaleString()} · {record.mode} · {record.sourceLang}→{record.targetLang}
        </span>
        {record.favorite && <span className="text-accent">★</span>}
      </div>

      {record.sourceText && (
        <div data-testid="history-card-source" className="text-sm text-muted line-clamp-2">
          {record.sourceText}
        </div>
      )}

      <div className="text-sm text-fg line-clamp-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdCompact as never}>
          {record.resultText}
        </ReactMarkdown>
      </div>

      <div className="flex gap-2 text-xs pt-1">
        <button className="text-muted hover:text-fg" onClick={copy}>复制</button>
        <button className="text-muted hover:text-fg" onClick={toggleFavorite}>
          {record.favorite ? '取消收藏' : '收藏'}
        </button>
        <button className="text-muted hover:text-danger" onClick={remove}>删除</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/history-card.test.tsx`
Expected: PASS — all 8 cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/HistoryCard.tsx tests/history-card.test.tsx
git commit -m "feat(history): add HistoryCard component"
```

---

## Task 7: HistoryDetailModal component

**Files:**
- Create: `src/components/history/HistoryDetailModal.tsx`
- Create: `tests/history-detail-modal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/history-detail-modal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryDetailModal } from '@/components/history/HistoryDetailModal';
import type { HistoryRecord } from '@shared/types';

const readAssetMock = vi.fn();
const favoriteMock = vi.fn(async () => ({ ok: true }));
const deleteMock = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  readAssetMock.mockReset();
  favoriteMock.mockClear();
  deleteMock.mockClear();
  // @ts-expect-error stub
  window.electron = {
    history: {
      favorite: favoriteMock,
      delete: deleteMock,
      readAsset: readAssetMock,
    },
  };
  // @ts-expect-error stub
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function rec(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'r1',
    createdAt: new Date('2026-05-01T08:30:00Z').getTime(),
    mode: 'text',
    sourceLang: 'zh',
    targetLang: 'en',
    sourceText: '你好世界',
    resultText: '# Hello\n\nworld',
    assetPath: null,
    favorite: false,
    tokenUsage: null,
    ...over,
  };
}

describe('HistoryDetailModal', () => {
  it('renders nothing when record is null', () => {
    const { container } = render(
      <HistoryDetailModal record={null} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders full markdown translation (heading element)', () => {
    render(<HistoryDetailModal record={rec()} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument();
  });

  it('renders source text section when sourceText present', () => {
    render(<HistoryDetailModal record={rec()} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText('原文')).toBeInTheDocument();
    expect(screen.getByText('你好世界')).toBeInTheDocument();
  });

  it('does not call readAsset for text records', () => {
    render(<HistoryDetailModal record={rec()} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(readAssetMock).not.toHaveBeenCalled();
  });

  it('fetches and renders image for image records', async () => {
    readAssetMock.mockResolvedValue({ mime: 'image/png', dataUrl: 'data:image/png;base64,AAA' });
    render(
      <HistoryDetailModal
        record={rec({ mode: 'image', assetPath: '/p.png', sourceText: null })}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await waitFor(() => expect(readAssetMock).toHaveBeenCalledWith('r1'));
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAA');
  });

  it('does not render <img> when assetPath is null', async () => {
    render(
      <HistoryDetailModal
        record={rec({ mode: 'image', assetPath: null, sourceText: null })}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(readAssetMock).not.toHaveBeenCalled();
  });

  it('shows audio filename only for audio records', () => {
    render(
      <HistoryDetailModal
        record={rec({ mode: 'audio', assetPath: '/some/dir/voice.mp3', sourceText: null })}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText('voice.mp3')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(readAssetMock).not.toHaveBeenCalled();
  });

  it('ESC calls onClose', async () => {
    const onClose = vi.fn();
    render(<HistoryDetailModal record={rec()} onClose={onClose} onChanged={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the overlay calls onClose; clicking inside does not', async () => {
    const onClose = vi.fn();
    render(<HistoryDetailModal record={rec()} onClose={onClose} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByTestId('history-modal-panel'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('history-modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('delete confirms, calls ipc, then closes and notifies parent', async () => {
    const onClose = vi.fn();
    const onChanged = vi.fn();
    render(<HistoryDetailModal record={rec()} onClose={onClose} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(deleteMock).toHaveBeenCalledWith('r1');
    expect(onClose).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/history-detail-modal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the modal**

Create `src/components/history/HistoryDetailModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { HistoryRecord } from '@shared/types';
import { ipc } from '@/lib/ipc';
import { Lightbox } from '@/components/ui/Lightbox';
import { mdRich } from '@/components/markdown/components';

interface Props {
  record: HistoryRecord | null;
  onClose: () => void;
  onChanged: () => void;
}

function basename(p: string): string {
  const m = p.match(/[^\\/]+$/);
  return m ? m[0] : p;
}

export function HistoryDetailModal({ record, onClose, onChanged }: Props) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // ESC to close
  useEffect(() => {
    if (!record) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [record, onClose]);

  // Lazy-load image when record changes
  useEffect(() => {
    setImageDataUrl(null);
    setImageError(false);
    if (!record || record.mode !== 'image' || !record.assetPath) return;
    setImageLoading(true);
    let cancelled = false;
    void ipc()
      .history.readAsset(record.id)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setImageError(true);
        } else {
          setImageDataUrl(res.dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [record]);

  if (!record) return null;

  async function copy() {
    await navigator.clipboard.writeText(record!.resultText);
  }
  async function toggleFavorite() {
    await ipc().history.favorite(record!.id, !record!.favorite);
    onChanged();
  }
  async function remove() {
    if (!window.confirm('删除这条历史？')) return;
    await ipc().history.delete(record!.id);
    onClose();
    onChanged();
  }

  return (
    <>
      <div
        data-testid="history-modal-overlay"
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          data-testid="history-modal-panel"
          className="relative w-[90vw] max-w-3xl max-h-[85vh] overflow-auto bg-bg border border-border rounded-lg p-6 flex flex-col gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-[color:var(--border)] text-fg hover:opacity-80 text-lg leading-none"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>

          <div className="flex items-center gap-3 text-xs text-muted">
            <span>
              {new Date(record.createdAt).toLocaleString()} · {record.mode} ·{' '}
              {record.sourceLang}→{record.targetLang}
            </span>
            <button
              className={`ml-auto mr-8 ${record.favorite ? 'text-accent' : 'text-muted hover:text-fg'}`}
              onClick={toggleFavorite}
              aria-label="favorite"
            >
              {record.favorite ? '★' : '☆'}
            </button>
          </div>

          {record.mode === 'image' && record.assetPath && (
            <div>
              {imageLoading && <div className="text-muted text-xs">加载图片…</div>}
              {imageError && <div className="text-danger text-xs">图片加载失败</div>}
              {imageDataUrl && (
                <img
                  src={imageDataUrl}
                  alt={basename(record.assetPath)}
                  className="max-h-64 rounded-md cursor-zoom-in shadow-sm"
                  onClick={() => setLightboxOpen(true)}
                />
              )}
            </div>
          )}

          {record.mode === 'audio' && record.assetPath && (
            <div className="text-sm text-muted">{basename(record.assetPath)}</div>
          )}

          {record.sourceText && (
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted">原文</div>
              <div className="whitespace-pre-wrap break-words text-sm text-fg">
                {record.sourceText}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted">译文</div>
            <div className="text-fg break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdRich as never}>
                {record.resultText}
              </ReactMarkdown>
            </div>
          </div>

          <div className="flex gap-3 pt-3 border-t border-border text-xs">
            <button className="text-muted hover:text-fg" onClick={copy}>
              复制译文
            </button>
            <button className="text-muted hover:text-fg" onClick={toggleFavorite}>
              {record.favorite ? '取消收藏' : '收藏'}
            </button>
            <button className="text-muted hover:text-danger" onClick={remove}>
              删除
            </button>
          </div>
        </div>
      </div>
      <Lightbox
        open={lightboxOpen}
        src={imageDataUrl ?? ''}
        alt={record.assetPath ? basename(record.assetPath) : undefined}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- tests/history-detail-modal.test.tsx`
Expected: PASS — all 10 cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/HistoryDetailModal.tsx tests/history-detail-modal.test.tsx
git commit -m "feat(history): add HistoryDetailModal with sandboxed image fetch"
```

---

## Task 8: Wire HistoryList to use the grid + modal

**Files:**
- Modify: `src/components/history/HistoryList.tsx`

- [ ] **Step 1: Replace the file**

Overwrite `src/components/history/HistoryList.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import type { HistoryRecord } from '@shared/types';
import { ipc } from '@/lib/ipc';
import { HistoryCard } from './HistoryCard';
import { HistoryDetailModal } from './HistoryDetailModal';

export function HistoryList() {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  const [q, setQ] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function reload() {
    const list = await ipc().history.list({ query: q || undefined, favoritesOnly: favOnly, limit: 200 });
    setItems(list);
  }

  useEffect(() => {
    void reload();
  }, [q, favOnly]);

  async function clearAll() {
    if (!window.confirm('清空所有历史（包括收藏）？此操作不可撤销。')) return;
    await ipc().history.clear();
    setSelectedId(null);
    void reload();
  }

  // Re-derive the modal record from the freshest list, and auto-close if it's gone.
  const selected = selectedId ? items.find((r) => r.id === selectedId) ?? null : null;

  return (
    <div className="p-6 flex flex-col gap-3 h-full overflow-hidden">
      <div className="flex gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索原文/译文"
          className="flex-1 h-9 px-3 rounded-md border border-border bg-bg text-fg outline-none focus:border-accent"
        />
        <label className="text-sm text-muted flex items-center gap-1">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} /> 仅收藏
        </label>
        <button onClick={clearAll} className="px-3 h-9 rounded-md border border-border text-danger">
          清空
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="text-muted text-sm p-3">暂无记录</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((r) => (
              <HistoryCard
                key={r.id}
                record={r}
                onOpen={(rec) => setSelectedId(rec.id)}
                onChanged={() => void reload()}
              />
            ))}
          </div>
        )}
      </div>

      <HistoryDetailModal
        record={selected}
        onClose={() => setSelectedId(null)}
        onChanged={() => void reload()}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the test suite still passes**

Run: `npm test`
Expected: PASS for all suites (including the existing component tests which don't depend on HistoryList).

- [ ] **Step 3: Verify typecheck and lint**

Run: `npm run typecheck`
Expected: PASS — no errors.

Run: `npm run lint`
Expected: PASS, or report only pre-existing warnings unrelated to these files.

- [ ] **Step 4: Manual smoke test in dev**

Run: `npm run dev`

Verify in the running app:
1. Open the History tab. Existing records render as a grid of cards (1 column on narrow, 2 on `md`, 3 on `xl`).
2. Each card shows timestamp · mode · `zh→en` and clamps the translation to 3 lines.
3. Clicking a card opens the modal with the full markdown translation.
4. For an existing image record, the modal renders the image; clicking the image opens the existing Lightbox.
5. Clicking ★ in the modal toggles favorite; the modal stays open and reflects the new state.
6. Clicking 删除 in the modal confirms, closes the modal, and the card disappears.
7. Clicking the card's footer buttons does not open the modal.
8. ESC closes the modal; clicking the dimmed backdrop closes it; clicking inside the panel does not.

If any check fails, report exactly which one and stop — do not patch over symptoms.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/HistoryList.tsx
git commit -m "feat(history): render history as card grid with detail modal"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: ALL tests pass — including `markdown-components`, `history-card`, `history-detail-modal`, `history-db`, `ipc-history`, `translation-view`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS, or only pre-existing warnings.

- [ ] **Step 4: Confirm there are no uncommitted changes**

Run: `git status`
Expected: working tree clean (apart from pre-existing modifications to `src/pages/Translate.tsx` and `src/styles/globals.css` that existed before this plan started).

---

## Self-Review Notes

- **Spec coverage:** Card layout (Task 6), modal (Task 7), grid + state (Task 8), `history.readAsset` IPC + sandbox (Tasks 2, 3, 4, 5), shared markdown (Task 1), tests (1, 2, 4, 6, 7), refactor of `mdCompact`/`mdRich` (Task 1). All spec sections covered.
- **No placeholders:** Every code step contains complete code.
- **Type consistency:** `getAssetById` returns `{ assetPath, mode }` in both Task 2 (DB) and Task 4 (consumer); `HistoryAssetReadResult` shape `{ mime, dataUrl }` matches between Task 3 (types), Task 4 (handler), and Task 7 (consumer); `readAsset(id)` signature matches Tasks 5 (preload), 4 (handler), and 7 (caller).
- **Decision recorded:** modal stays open after favorite toggle; closes after delete. Both modeled in Task 7 step 3 and tested in Task 7 step 1.
