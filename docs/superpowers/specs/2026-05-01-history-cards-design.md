# History as Cards — Design

**Status:** Approved
**Date:** 2026-05-01
**Owner:** zhangshaojie

## Goal

Replace the current divided-list rendering on the History page with a card-based grid. Each card surfaces just enough metadata and a translation preview to scan quickly; clicking a card opens a modal that shows the full translation, the source text, and (for image records) the original image.

## Non-Goals

- No changes to the history schema, search behavior, "仅收藏" filter, or 清空 action.
- No audio playback in the modal. Audio records show filename text only.
- No changes to how records are created, deleted, or favorited from the translate flow.

## User Stories

1. As a user, I open the History tab and see a responsive grid of cards. Each card shows the timestamp, mode, language pair, a short source preview, and a clamped translation preview.
2. As a user, I click a card and a modal opens with the full markdown-rendered translation, the full source text, and (for image entries) a thumbnail I can zoom via the existing Lightbox.
3. As a user, I can copy / favorite / delete from the card footer without triggering the modal.
4. As a user, I can copy / favorite / delete from inside the modal; deleting closes the modal and refreshes the list.

## Architecture

### New / modified files

| File | Change |
|---|---|
| `src/components/history/HistoryCard.tsx` | **New.** Single card component. |
| `src/components/history/HistoryDetailModal.tsx` | **New.** Modal for the full record view. |
| `src/components/history/HistoryList.tsx` | **Modified.** Replaces the `divide-y` list with a responsive grid; owns `selected: HistoryRecord \| null` state for the modal; passes a click handler into each card. |
| `shared/types.ts` | **Modified.** Adds the response shape for `history.readAsset`. |
| `electron/preload.ts` | **Modified.** Exposes `history.readAsset(id)`. |
| `electron/main/ipc/history.ts` | **Modified.** Adds `history:read-asset` handler. |
| `tests/history-card.test.tsx` | **New.** Card behavior. |
| `tests/history-detail-modal.test.tsx` | **New.** Modal behavior. |
| `tests/history-ipc-asset.test.ts` | **New.** IPC happy path + missing asset. |

### Data flow

```
HistoryList (grid)
  ├─ HistoryCard (per record)
  │    ├─ click whole card → onOpen(record)
  │    └─ click footer button → e.stopPropagation(); call ipc.history.{favorite|delete} or clipboard
  └─ HistoryDetailModal (when selected !== null)
       ├─ on open with mode==='image' && assetPath → ipc.history.readAsset(id) → render <img>
       ├─ click <img> → open existing <Lightbox>
       └─ footer actions: copy, favorite toggle, delete
```

## Component Specs

### HistoryCard

**Props**
```ts
interface HistoryCardProps {
  record: HistoryRecord;
  onOpen: (record: HistoryRecord) => void;
  onChanged: () => void; // called after favorite/delete to trigger reload
}
```

**Layout**
- Outer: `border border-border rounded-lg p-3 cursor-pointer hover:border-accent hover:shadow-sm transition-colors flex flex-col gap-2`.
- Header row (xs muted, flex justify-between):
  - Left: `new Date(createdAt).toLocaleString()` · `mode` · `sourceLang→targetLang`.
  - Right: `★` (text-accent) when `favorite`.
- Source preview (only when `sourceText` present, sm muted, `line-clamp-2`).
  - For `mode === 'image' | 'audio'` with no `sourceText`, omit this row.
- Translation preview: sm fg, `line-clamp-3`, rendered via the existing `mdCompact` markdown component map already defined in `HistoryList.tsx` (extracted into a shared module — see Refactor Notes).
- Footer row: xs, `flex gap-2`, three buttons:
  - 复制 → `navigator.clipboard.writeText(record.resultText)`
  - 收藏 / 取消收藏 → `ipc().history.favorite(id, !favorite)` then `onChanged()`
  - 删除 → confirm, then `ipc().history.delete(id)` then `onChanged()`
- All footer button handlers call `e.stopPropagation()` so clicking them does not bubble up to the card's `onClick`.

### HistoryDetailModal

**Props**
```ts
interface HistoryDetailModalProps {
  record: HistoryRecord | null; // null = closed
  onClose: () => void;
  onChanged: () => void; // reload list (after delete or favorite)
}
```

**Behavior**
- Returns `null` when `record === null`.
- Outer overlay: `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center`. Clicking the overlay closes the modal.
- ESC key closes the modal (mirrors `Lightbox`).
- Inner panel: `max-w-3xl w-[90vw] max-h-[85vh] overflow-auto bg-bg border border-border rounded-lg p-6 flex flex-col gap-4`. `onClick={(e) => e.stopPropagation()}` so clicks inside don't close.
- Close button top-right (× icon, same style as `Lightbox`).

**Sections (top → bottom)**

1. **Header**: timestamp · mode · `sourceLang→targetLang` · favorite toggle button (★).
2. **Image** (when `record.mode === 'image' && record.assetPath`):
   - On modal open with these conditions, fire `ipc().history.readAsset(record.id)`. While loading, render a small `text-muted text-xs` placeholder ("加载图片…"). On success, render `<img class="max-h-64 rounded cursor-zoom-in" />`. On failure, render `text-danger text-xs` ("图片加载失败"). Clicking the image opens the existing `<Lightbox>` (already at `src/components/ui/Lightbox.tsx`).
3. **Audio** (when `record.mode === 'audio' && record.assetPath`):
   - Render only the filename (basename of `assetPath`) inside a muted text block. No player.
4. **Source section** (when `record.sourceText`):
   - Label `原文` (xs, muted), then a block with `whitespace-pre-wrap break-words text-sm text-fg`.
5. **Translation section**:
   - Label `译文` (xs, muted), then full markdown via the rich `md` map currently defined in `TranslationView.tsx` (extracted into a shared module — see Refactor Notes).
6. **Footer actions** (`flex gap-3 pt-3 border-t border-border`):
   - 复制译文 → clipboard
   - 收藏 / 取消收藏 → `ipc().history.favorite` + `onChanged()`. Modal stays open and re-reads from the prop on next render — parent passes the updated record after reload (see Open Questions resolved below).
   - 删除 → `window.confirm("删除这条历史？")` then `ipc().history.delete` + `onClose()` + `onChanged()`.

### HistoryList changes

- Replace the `flex flex-col divide-y divide-border` container with `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`.
- Add state: `const [selected, setSelected] = useState<HistoryRecord | null>(null);`
- For each record: `<HistoryCard record={r} onOpen={setSelected} onChanged={reload} />`.
- After the grid: `<HistoryDetailModal record={selected} onClose={() => setSelected(null)} onChanged={reload} />`.
- After `reload()`, if `selected` is non-null, re-derive it from the freshly fetched list (look up by id) so the modal reflects favorite/delete updates. If the record is gone, set `selected` to null.

### Refactor: shared markdown component maps

Currently `mdCompact` lives in `HistoryList.tsx` and `md` (rich) lives in `TranslationView.tsx`. Extract both into:

- `src/components/markdown/components.tsx` exporting `mdCompact` and `mdRich`.

Update both call sites to import from there. This keeps the new `HistoryCard` and `HistoryDetailModal` from duplicating the maps.

## IPC: history.readAsset

### Shared types (`shared/types.ts`)

```ts
export interface HistoryAssetReadResult {
  mime: string;
  dataUrl: string; // "data:<mime>;base64,..."
}
```

### Preload (`electron/preload.ts`)

```ts
history: {
  // ...existing
  readAsset: (id: string): Promise<HistoryAssetReadResult | null> =>
    ipcRenderer.invoke('history:read-asset', { id }),
}
```

### Main handler (`electron/main/ipc/history.ts`)

```ts
ipcMain.handle('history:read-asset', (_e, { id }: { id: string }) => {
  const row = getDb().getAssetById(id); // new DB helper returning { asset_path, mode } | null
  if (!row?.asset_path) return null;
  // Sandbox: ensure the path lives inside getAssetDir()
  const assetDir = getAssetDir();
  const resolved = path.resolve(row.asset_path);
  if (!resolved.startsWith(path.resolve(assetDir) + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  const bytes = fs.readFileSync(resolved);
  const mime = mimeFromExt(path.extname(resolved));
  return { mime, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
});
```

- `getAssetById(id)` is a new method on the history DB returning `{ asset_path, mode }` or `null`.
- `mimeFromExt` is a small local helper (`.png` → `image/png`, `.jpg`/`.jpeg` → `image/jpeg`, `.webp` → `image/webp`, `.gif` → `image/gif`, `.mp3` → `audio/mpeg`, `.wav` → `audio/wav`, `.m4a` → `audio/mp4`, `.ogg` → `audio/ogg`, fallback `application/octet-stream`).

### Security

- The handler resolves the stored `asset_path` and refuses to read anything outside the app's `assets/` directory. This prevents a corrupted DB row from being used to read arbitrary files.

## Error Handling

- IPC failure in modal → render `text-danger text-xs` ("图片加载失败"); the rest of the modal still works.
- Missing asset (deleted on disk, DB row stale) → handler returns `null`, modal shows nothing where the image would be (no error).
- Markdown rendering exceptions → already isolated to the markdown subtree; not new behavior.

## Testing

### Component tests (vitest + @testing-library/react)

`tests/history-card.test.tsx`:
- Renders timestamp / mode / language pair / source preview / clamped translation.
- Shows ★ when `favorite` is true; not when false.
- Clicking the card body calls `onOpen` with the record.
- Clicking 复制 / 收藏 / 删除 does **not** call `onOpen`.
- Clicking 收藏 calls `ipc.history.favorite` with toggled value and then `onChanged`.

`tests/history-detail-modal.test.tsx`:
- Returns null when `record` is null.
- Renders full markdown translation (e.g., a heading or list element appears, unlike the clamped/compact card view).
- For `mode==='image'` with `assetPath`, calls `ipc.history.readAsset` once on open and renders an `<img>` whose `src` is the returned `dataUrl`.
- For `mode==='text'` does not call `readAsset` and renders no `<img>`.
- Pressing ESC calls `onClose`.
- Clicking the overlay calls `onClose`; clicking inside the panel does not.

### IPC test

`tests/history-ipc-asset.test.ts`:
- Happy path: insert a record with a real asset file in a tmp dir → handler returns `{ mime, dataUrl }` matching the file.
- Missing file on disk → returns `null`.
- Path-traversal protection: a record whose `asset_path` is outside the asset dir → returns `null`.

## Out of Scope / Future Work

- Audio playback in the modal.
- Inline / drawer alternative view modes.
- Pagination for very large history lists (current `limit: 200` ceiling is unchanged).
- A dedicated custom protocol (`app://asset/<id>`) — data URLs are sufficient at the current size cap (10 MB image, 20 MB audio).
