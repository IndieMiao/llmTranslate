# Gemini Model Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 模型 section to Settings with a curated Gemini model dropdown plus a 自定义 free-text fallback, and bump the default model for fresh installs to `gemini-3.0-flash`.

**Architecture:** Pure UI addition to `SettingsPanel.tsx` plus a one-line default change in `shared/types.ts`. The `Settings.model` field already flows through `settings:set → main → streamTranslate(opts.model)`, so no IPC, preload, or main-process changes.

**Tech Stack:** React 18, Tailwind, vitest + @testing-library/react. Existing toast and `update()` helpers in `SettingsPanel`.

---

## Reference: spec

`docs/superpowers/specs/2026-05-02-gemini-model-selector-design.md`

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `shared/types.ts` | **Modified** | Bump `DEFAULT_SETTINGS.model` from `gemini-2.0-flash` to `gemini-3.0-flash`; update inline comment. |
| `src/components/settings/SettingsPanel.tsx` | **Modified** | Add 模型 section with curated `<select>` and conditional 自定义 input + 保存 button. |
| `tests/settings-panel.test.tsx` | **New** | Cover the 6 cases from the spec. |

No changes to preload, main IPC, gemini service, or DB.

---

## Task 1: Bump default model

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Update the default and comment**

In `shared/types.ts`, change the `DEFAULT_SETTINGS` constant. The current value:

```ts
export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'gemini-2.0-flash',
  theme: 'system',
  shortcut: 'Ctrl+Shift+T',
  languagePair: 'zh-en',
  history: { maxRecords: 200 },
};
```

Change `model: 'gemini-2.0-flash'` to `model: 'gemini-3.0-flash'`.

Also, update the comment on the `Settings.model` interface field. Currently:

```ts
model: string;           // gemini-2.0-flash default
```

Change to:

```ts
model: string;           // gemini-3.0-flash default
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: PASS for all 17 suites / 74 tests. The default change is not asserted anywhere.

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat(settings): bump default model to gemini-3.0-flash"
```

---

## Task 2: Settings panel — model selector UI

**Files:**
- Create: `tests/settings-panel.test.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/settings-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import type { Settings } from '@shared/types';

const baseSettings: Settings = {
  apiKey: 'sk-test-1234',
  model: 'gemini-2.5-flash',
  theme: 'system',
  shortcut: 'Ctrl+Shift+T',
  languagePair: 'zh-en',
  history: { maxRecords: 200 },
};

let current: Settings;
const settingsGet = vi.fn(async () => current);
const settingsSet = vi.fn(async (patch: Partial<Settings>) => {
  current = { ...current, ...patch } as Settings;
  return current;
});
const openLogDir = vi.fn();

beforeEach(() => {
  current = { ...baseSettings };
  settingsGet.mockClear();
  settingsSet.mockClear();
  openLogDir.mockClear();
  Object.assign(window, {
    electron: {
      settings: { get: settingsGet, set: settingsSet },
      app: { openLogDir },
    },
  });
});

async function renderPanel(over: Partial<Settings> = {}) {
  current = { ...baseSettings, ...over };
  render(<SettingsPanel />);
  // Wait for async settings.get() to resolve and render the form
  await screen.findByLabelText('模型');
}

describe('SettingsPanel — model selector', () => {
  it('preselects a curated saved model', async () => {
    await renderPanel({ model: 'gemini-2.5-flash' });
    const select = screen.getByLabelText('模型') as HTMLSelectElement;
    expect(select.value).toBe('gemini-2.5-flash');
    expect(screen.queryByTestId('model-custom-input')).toBeNull();
  });

  it('switching to a curated option calls settings.set', async () => {
    await renderPanel({ model: 'gemini-2.5-flash' });
    const select = screen.getByLabelText('模型');
    await userEvent.selectOptions(select, 'gemini-2.5-pro');
    await waitFor(() =>
      expect(settingsSet).toHaveBeenCalledWith({ model: 'gemini-2.5-pro' }),
    );
  });

  it('non-curated saved model shows 自定义 with the value in the input', async () => {
    await renderPanel({ model: 'gemini-1.5-pro' });
    const select = screen.getByLabelText('模型') as HTMLSelectElement;
    expect(select.value).toBe('__custom__');
    const input = screen.getByTestId('model-custom-input') as HTMLInputElement;
    expect(input.value).toBe('gemini-1.5-pro');
  });

  it('picking 自定义 reveals the input and does not call settings.set', async () => {
    await renderPanel({ model: 'gemini-2.5-flash' });
    const select = screen.getByLabelText('模型');
    await userEvent.selectOptions(select, '__custom__');
    const input = screen.getByTestId('model-custom-input') as HTMLInputElement;
    expect(input.value).toBe('gemini-2.5-flash');
    expect(settingsSet).not.toHaveBeenCalled();
  });

  it('保存 button is disabled when custom input is empty', async () => {
    await renderPanel({ model: 'gemini-1.5-pro' });
    const input = screen.getByTestId('model-custom-input') as HTMLInputElement;
    await userEvent.clear(input);
    const saveBtn = screen.getByTestId('model-custom-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('saving non-empty custom input calls settings.set with trimmed value', async () => {
    await renderPanel({ model: 'gemini-2.5-flash' });
    await userEvent.selectOptions(screen.getByLabelText('模型'), '__custom__');
    const input = screen.getByTestId('model-custom-input');
    await userEvent.clear(input);
    await userEvent.type(input, '  gemini-foo  ');
    await userEvent.click(screen.getByTestId('model-custom-save'));
    await waitFor(() =>
      expect(settingsSet).toHaveBeenCalledWith({ model: 'gemini-foo' }),
    );
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/settings-panel.test.tsx`
Expected: FAIL — `screen.findByLabelText('模型')` cannot find the section because it doesn't exist yet.

- [ ] **Step 3: Implement the model section in SettingsPanel**

Open `src/components/settings/SettingsPanel.tsx`. Add `MODEL_OPTIONS` and `CUSTOM_SENTINEL` near the top of the file, just below the import block:

```tsx
const MODEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
];
const CUSTOM_SENTINEL = '__custom__';
const isCuratedModel = (m: string) => MODEL_OPTIONS.some((o) => o.value === m);
```

Inside the `SettingsPanel` component body, after the existing `useState` hooks, add the model state and a sync effect (paste right after `const [shortcutInput, setShortcutInput] = useState('');`):

```tsx
  const [modelSelect, setModelSelect] = useState<string>('');
  const [modelCustom, setModelCustom] = useState<string>('');

  useEffect(() => {
    if (!s) return;
    setModelSelect(isCuratedModel(s.model) ? s.model : CUSTOM_SENTINEL);
    setModelCustom(isCuratedModel(s.model) ? '' : s.model);
  }, [s]);
```

Then add a new `<section>` between the API key section (closes around `</section>` after the masked key block) and the existing 主题 section. Insert it immediately before the line `<section className="flex flex-col gap-2">` that contains `<h2 className="text-fg text-lg">主题</h2>`:

```tsx
      <section className="flex flex-col gap-2">
        <h2 className="text-fg text-lg">模型</h2>
        <select
          aria-label="模型"
          className="h-9 px-3 rounded-md border border-border bg-bg text-fg outline-none focus:border-accent"
          value={modelSelect}
          onChange={(e) => {
            const v = e.target.value;
            setModelSelect(v);
            if (v === CUSTOM_SENTINEL) {
              setModelCustom(s!.model);
              return;
            }
            const opt = MODEL_OPTIONS.find((o) => o.value === v);
            void update({ model: v });
            pushToast(`模型已切换为 ${opt?.label ?? v}`);
          }}
        >
          {MODEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          <option value={CUSTOM_SENTINEL}>自定义…</option>
        </select>
        {modelSelect === CUSTOM_SENTINEL && (
          <div className="flex gap-2">
            <input
              data-testid="model-custom-input"
              className="flex-1 h-9 px-3 rounded-md border border-border bg-bg text-fg outline-none focus:border-accent"
              value={modelCustom}
              onChange={(e) => setModelCustom(e.target.value)}
              placeholder="例如 gemini-1.5-pro"
            />
            <button
              data-testid="model-custom-save"
              className="px-3 h-9 rounded-md bg-accent text-accent-fg disabled:opacity-50"
              disabled={modelCustom.trim() === '' || modelCustom.trim() === s.model}
              onClick={async () => {
                const trimmed = modelCustom.trim();
                await update({ model: trimmed });
                pushToast(`模型已切换为 ${trimmed}`);
              }}
            >
              保存
            </button>
          </div>
        )}
      </section>
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- tests/settings-panel.test.tsx`
Expected: PASS — all 6 cases.

- [ ] **Step 5: Run the full suite to make sure nothing else broke**

Run: `npm test`
Expected: PASS — 18 suites / 80 tests (74 prior + 6 new).

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`

Verify in the running app:
1. Settings page now shows a 模型 dropdown between API key and 主题.
2. Saved model preselects correctly (e.g. `Gemini 2.5 Flash`).
3. Picking a different curated option triggers the toast `模型已切换为 <label>` and the change persists across a settings reload.
4. Picking `自定义…` reveals an input prefilled with the current model and a 保存 button. Empty input disables 保存. Typing a value and clicking 保存 toasts and persists.
5. After 保存ing a non-curated value, reopening Settings shows `自定义…` selected and the input prefilled with that value.

If any check fails, report exactly which one and stop — do not patch over symptoms.

- [ ] **Step 8: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx tests/settings-panel.test.tsx
git commit -m "feat(settings): add Gemini model selector with custom override"
```

---

## Task 3: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: ALL pass — including the new `settings-panel` suite.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Confirm no leftover changes**

Run: `git status`
Expected: working tree clean apart from the pre-existing `src/pages/Translate.tsx` and `src/styles/globals.css` modifications that existed before this plan.

---

## Self-Review Notes

- **Spec coverage:**
  - Curated list ↔ Task 2 step 3 (`MODEL_OPTIONS`).
  - Default change ↔ Task 1.
  - State derivation (`modelSelect`/`modelCustom` + useEffect) ↔ Task 2 step 3.
  - Curated change → immediate save with toast ↔ Task 2 step 3 (`onChange`).
  - 自定义 reveals input, no auto-save ↔ Task 2 step 3 (early return on `CUSTOM_SENTINEL`).
  - Empty / unchanged input disables 保存 ↔ Task 2 step 3 (`disabled` expression) + test 5.
  - Trimmed save ↔ Task 2 step 3 + test 6.
  - Non-curated saved model shows 自定义 ↔ Task 2 step 3 (sync effect) + test 3.
  - 6 test cases ↔ Task 2 step 1 (one for each spec testing item).
- **No placeholders.**
- **Type consistency:** `CUSTOM_SENTINEL = '__custom__'` and `isCuratedModel` are defined once and used consistently in tests and implementation.
