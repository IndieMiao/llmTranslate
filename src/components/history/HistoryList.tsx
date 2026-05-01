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
