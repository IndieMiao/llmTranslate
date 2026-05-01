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
    <div className="border border-border rounded-md p-4 min-h-[120px] flex flex-col gap-2">
      {status === 'error' ? (
        <div className="text-danger text-sm">{errorMessage}</div>
      ) : (
        <div className="text-fg whitespace-pre-wrap break-words">
          {text}
          {status === 'streaming' && <span data-testid="caret" className="inline-block w-2 h-4 align-middle bg-accent ml-0.5 animate-pulse" />}
          {status === 'cancelled' && <span className="ml-2 text-xs text-muted">[已取消]</span>}
        </div>
      )}
      {status === 'ok' && (
        <div className="flex gap-2 mt-1">
          <button className="text-xs text-muted hover:text-fg" onClick={onCopy}>复制</button>
          <button className="text-xs text-muted hover:text-fg" onClick={onFavorite}>收藏</button>
          <button className="text-xs text-muted hover:text-fg" onClick={onRetranslate}>重新翻译</button>
        </div>
      )}
    </div>
  );
}
