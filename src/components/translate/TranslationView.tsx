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
  const empty = status === 'idle' && !text && !errorMessage;
  if (empty) return null;
  return (
    <div className="border border-border rounded-lg p-5 flex flex-col gap-2">
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
