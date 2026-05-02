import { useEffect, useState } from 'react';
import type { Settings, ThemeChoice } from '@shared/types';
import { ipc } from '@/lib/ipc';
import { pushToast } from '@/components/ui/Toast';
import { applyTheme } from '@/lib/theme';

const MODEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
];
const CUSTOM_SENTINEL = '__custom__';
const isCuratedModel = (m: string) => MODEL_OPTIONS.some((o) => o.value === m);

function maskKey(k: string): string {
  if (!k) return '未设置';
  return '••••••••' + k.slice(-4);
}

export function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [shortcutInput, setShortcutInput] = useState('');
  const [modelSelect, setModelSelect] = useState<string>('');
  const [modelCustom, setModelCustom] = useState<string>('');

  useEffect(() => { void ipc().settings.get().then((v) => { setS(v); setShortcutInput(v.shortcut); }); }, []);

  useEffect(() => {
    if (!s) return;
    setModelSelect(isCuratedModel(s.model) ? s.model : CUSTOM_SENTINEL);
    setModelCustom(isCuratedModel(s.model) ? '' : s.model);
  }, [s]);
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

      <section className="flex flex-col gap-2">
        <h2 className="text-fg text-lg">主题</h2>
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as ThemeChoice[]).map((t) => (
            <button key={t}
              className={`px-3 h-9 rounded-md border ${s.theme === t ? 'border-accent text-fg' : 'border-border text-muted'}`}
              onClick={() => {
                void update({ theme: t });
                // Apply immediately so the renderer reflects the change without waiting for IPC round-trip
                if (t !== 'system') applyTheme(t);
              }}
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
