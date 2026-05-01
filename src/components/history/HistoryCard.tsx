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
