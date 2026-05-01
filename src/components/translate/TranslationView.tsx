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
    <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{props.children}</p>
  ),
  strong: (props: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-fg">{props.children}</strong>
  ),
  em: (props: { children?: React.ReactNode }) => (
    <em className="italic">{props.children}</em>
  ),
  ul: (props: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside pl-6 my-2 space-y-1">{props.children}</ul>
  ),
  ol: (props: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside pl-6 my-2 space-y-1">{props.children}</ol>
  ),
  li: (props: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{props.children}</li>
  ),
  h1: (props: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-semibold mt-3 mb-2 text-fg">{props.children}</h1>
  ),
  h2: (props: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-semibold mt-3 mb-2 text-fg">{props.children}</h2>
  ),
  h3: (props: { children?: React.ReactNode }) => (
    <h3 className="text-base font-semibold mt-2 mb-1 text-fg">{props.children}</h3>
  ),
  blockquote: (props: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-accent pl-3 my-2 text-muted">{props.children}</blockquote>
  ),
  code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
    inline === false ? (
      <code className="block">{children}</code>
    ) : (
      <code className="px-1.5 py-0.5 rounded bg-[color:var(--border)] text-fg font-mono text-[0.85em]">
        {children}
      </code>
    ),
  pre: (props: { children?: React.ReactNode }) => (
    <pre className="my-2 p-3 rounded-md bg-[color:var(--border)] overflow-x-auto text-xs font-mono leading-relaxed">
      {props.children}
    </pre>
  ),
  a: (props: { href?: string; children?: React.ReactNode }) => (
    <a href={props.href} className="text-accent underline hover:no-underline" onClick={(e) => e.preventDefault()}>
      {props.children}
    </a>
  ),
  hr: () => <hr className="my-3 border-border" />,
  table: (props: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="border-collapse text-sm">{props.children}</table>
    </div>
  ),
  th: (props: { children?: React.ReactNode }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">{props.children}</th>
  ),
  td: (props: { children?: React.ReactNode }) => (
    <td className="border border-border px-2 py-1">{props.children}</td>
  ),
};

export function TranslationView({ text, status, errorMessage, onCopy, onFavorite, onRetranslate }: Props) {
  return (
    <div className="border border-border rounded-md p-4 min-h-[120px] flex flex-col gap-2">
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
        <div className="flex gap-2 mt-1">
          <button className="text-xs text-muted hover:text-fg" onClick={onCopy}>
            复制
          </button>
          <button className="text-xs text-muted hover:text-fg" onClick={onFavorite}>
            收藏
          </button>
          <button className="text-xs text-muted hover:text-fg" onClick={onRetranslate}>
            重新翻译
          </button>
        </div>
      )}
    </div>
  );
}
