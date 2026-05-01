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
