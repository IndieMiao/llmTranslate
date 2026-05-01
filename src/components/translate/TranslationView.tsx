import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type ViewStatus = 'idle' | 'streaming' | 'ok' | 'cancelled' | 'error';

interface Props {
  text: string;
  status: ViewStatus;
  errorMessage?: string;
  onCopy: () => void;
  onFavorite: () => void;
  onRetranslate: () => void;
}

const md = {
  p: (props: { children?: React.ReactNode }) => (
    <p className="my-3 first:mt-0 last:mb-0 leading-7 text-base">{props.children}</p>
  ),
  strong: (props: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-fg">{props.children}</strong>
  ),
  em: (props: { children?: React.ReactNode }) => (
    <em className="italic text-fg">{props.children}</em>
  ),
  ul: (props: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside pl-6 my-3 space-y-2">{props.children}</ul>
  ),
  ol: (props: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside pl-6 my-3 space-y-2">{props.children}</ol>
  ),
  li: (props: { children?: React.ReactNode }) => (
    <li className="leading-7 text-base pl-1">{props.children}</li>
  ),
  h1: (props: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-bold mt-5 mb-3 text-fg leading-8">{props.children}</h1>
  ),
  h2: (props: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-bold mt-4 mb-2 text-fg leading-7">{props.children}</h2>
  ),
  h3: (props: { children?: React.ReactNode }) => (
    <h3 className="text-base font-bold mt-3 mb-1.5 text-fg leading-7">{props.children}</h3>
  ),
  blockquote: (props: { children?: React.ReactNode }) => (
    <blockquote className="border-l-[3px] border-accent pl-4 py-1 my-3 text-muted italic leading-7">{props.children}</blockquote>
  ),
  code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
    inline === false ? (
      <code className="block">{children}</code>
    ) : (
      <code className="px-1.5 py-0.5 rounded bg-[color:var(--border)] text-fg font-mono text-sm">
        {children}
      </code>
    ),
  pre: (props: { children?: React.ReactNode }) => (
    <pre className="my-3 p-4 rounded-lg bg-[color:var(--border)] overflow-x-auto text-sm font-mono leading-6">
      {props.children}
    </pre>
  ),
  a: (props: { href?: string; children?: React.ReactNode }) => (
    <a href={props.href} className="text-accent underline hover:no-underline" onClick={(e) => e.preventDefault()}>
      {props.children}
    </a>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: (props: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{props.children}</table>
    </div>
  ),
  th: (props: { children?: React.ReactNode }) => (
    <th className="border border-border px-3 py-2 text-left font-semibold bg-[color:var(--border)] text-fg">{props.children}</th>
  ),
  td: (props: { children?: React.ReactNode }) => (
    <td className="border border-border px-3 py-2">{props.children}</td>
  ),
};

export function TranslationView({ text, status, errorMessage, onCopy, onFavorite, onRetranslate }: Props) {
  return (
    <div className="border border-border rounded-lg p-5 min-h-[120px] flex flex-col gap-2">
      {status === 'error' ? (
        <div className="text-danger text-sm">{errorMessage}</div>
      ) : (
        <div className="text-fg break-words">
          {text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md as never}>
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
