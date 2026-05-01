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

  useEffect(() => {
    if (!record) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [record, onClose]);

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
