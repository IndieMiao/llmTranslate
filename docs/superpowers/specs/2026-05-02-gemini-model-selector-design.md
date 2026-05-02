# Gemini Model Selector — Design

**Status:** Approved
**Date:** 2026-05-02
**Owner:** zhangshaojie

## Goal

Let users pick the Gemini model from the Settings page. The `Settings.model` field already flows through `settings:set → main process → streamTranslate(opts.model)`, so this change is purely additive UI plus a default-value bump.

## Non-Goals

- No model-availability check against the SDK. Invalid model ids surface naturally on next translate via the existing `mapSdkError` path.
- No per-mode model (text vs image vs audio still share one model).
- No migration of existing users' saved `gemini-2.0-flash` value. They keep what they have; the dropdown shows it as a custom value.

## User Stories

1. As a user, I open Settings → 模型 and see a dropdown with curated Gemini models, with my current model preselected.
2. As a user, I pick a curated option and the change takes effect on my next translate.
3. As a user with an unusual / preview model, I pick `自定义…` and type the exact model id in a text input. The selector remembers it.
4. As a fresh-install user, my default model is `gemini-3.0-flash`.

## Curated Model List

```ts
const MODEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'gemini-3.0-flash',      label: 'Gemini 3.0 Flash' },
  { value: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
];
const CUSTOM_SENTINEL = '__custom__';
```

The list lives co-located inside `SettingsPanel.tsx` because it has only one consumer.

## Default Change

`shared/types.ts`:
- `DEFAULT_SETTINGS.model: 'gemini-3.0-flash'` (was `'gemini-2.0-flash'`).
- Comment updated from `// gemini-2.0-flash default` to `// gemini-3.0-flash default`.

This affects only fresh installs — `electron-store` keeps the existing user's stored value.

## UI Behavior

Section inserted between API key and 主题:

```
模型
[ Gemini 3.0 Flash       ▾ ]   ← <select>
[ gemini-1.5-pro            ]   ← visible only when 自定义… is selected
[ 保存 ]                        ← visible only when custom input is shown
```

### State

```tsx
const isCurated = (m: string) => MODEL_OPTIONS.some((o) => o.value === m);
const [selectVal, setSelectVal] = useState<string>(
  isCurated(s.model) ? s.model : CUSTOM_SENTINEL,
);
const [customInput, setCustomInput] = useState<string>(
  isCurated(s.model) ? '' : s.model,
);
```

When the underlying `s.model` changes (e.g. after a save), `selectVal` and `customInput` re-derive via a `useEffect` keyed on `s.model`.

### Selecting a curated value

`onChange` handler on the select:
- If new value is one of the curated values: call `update({ model: newValue })`, push toast `模型已切换为 <label>`. Hide the custom input.
- If new value is `__custom__`: show the custom input prefilled with the current `s.model`. **Do not call `update` yet** — the model only changes when the user clicks 保存.

### Custom input

- `保存` button is disabled when the trimmed input is empty or equal to `s.model`.
- Click 保存 → `update({ model: trimmed })`, push toast `模型已切换为 <trimmed>`.
- An empty submission is impossible because the button is disabled.

### Selecting a curated option while in custom mode

If the user is in custom mode and picks a curated value: switch immediately and discard the custom input draft.

## Validation

- **Frontend:** trim whitespace; reject empty (button disabled).
- **Backend:** none. The Gemini SDK validates model id at request time. Errors flow through the existing `mapSdkError` path (typically `INTERNAL` with the SDK message).

## Error Handling

- IPC `settings:set` failure (already handled): the existing `update` helper awaits the promise; if it throws, React surfaces the error via the existing global error handling. No new code path.

## Testing

`tests/settings-panel.test.tsx` (new). Stubs:

```ts
const settingsGet = vi.fn(async (): Promise<Settings> => ({...}));
const settingsSet = vi.fn(async (patch: Partial<Settings>): Promise<Settings> => ({...returned}));
window.electron = {
  settings: { get: settingsGet, set: settingsSet },
  app: { openLogDir: vi.fn() },
};
```

Cases:

1. **Curated preselected.** Mount with `model: 'gemini-2.5-flash'`. The select's value is `gemini-2.5-flash`; no custom input is shown.
2. **Switching curated calls IPC.** Pick `Gemini 2.5 Pro`. `settingsSet` called with `{ model: 'gemini-2.5-pro' }`.
3. **Non-curated shows custom mode.** Mount with `model: 'gemini-1.5-pro'`. Select shows `自定义…`; the input shows `gemini-1.5-pro`.
4. **Picking 自定义… reveals the input.** Mount with curated, pick `自定义…`, the text input becomes visible with the current model prefilled. `settingsSet` is NOT called.
5. **Empty custom input → 保存 disabled.** Clear the input, the 保存 button has `disabled` attribute. `settingsSet` not called.
6. **Submitting non-empty custom calls IPC with trimmed value.** Type `  gemini-foo  `, click 保存. `settingsSet` called with `{ model: 'gemini-foo' }`.

## Files Changed

| File | Status | Why |
|---|---|---|
| `shared/types.ts` | Modified | Bump `DEFAULT_SETTINGS.model` and comment. |
| `src/components/settings/SettingsPanel.tsx` | Modified | Add 模型 section. |
| `tests/settings-panel.test.tsx` | New | Cover the 6 cases above. |

No changes to preload, IPC handlers, main-process gemini service, or DB.

## Out of Scope / Future

- Model-availability validation against the SDK.
- Per-mode model selection.
- Auto-migrating users off `gemini-2.0-flash`.
- Surfacing model pricing/cost hints in the UI.
