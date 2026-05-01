import type { Components } from 'react-markdown';

type ChildrenProps = { children?: React.ReactNode };
type CodeProps = { inline?: boolean; children?: React.ReactNode };
type AnchorProps = { href?: string; children?: React.ReactNode };

export const mdCompact: Components = {
  p: (p: ChildrenProps) => <span>{p.children}</span>,
  strong: (p: ChildrenProps) => <strong className="font-semibold">{p.children}</strong>,
  em: (p: ChildrenProps) => <em className="italic">{p.children}</em>,
  ul: (p: ChildrenProps) => <span>{p.children}</span>,
  ol: (p: ChildrenProps) => <span>{p.children}</span>,
  li: (p: ChildrenProps) => (
    <span className="block before:content-['•'] before:mr-1.5">{p.children}</span>
  ),
  h1: (p: ChildrenProps) => <span className="font-bold">{p.children}</span>,
  h2: (p: ChildrenProps) => <span className="font-bold">{p.children}</span>,
  h3: (p: ChildrenProps) => <span className="font-bold">{p.children}</span>,
  blockquote: (p: ChildrenProps) => <span className="text-muted italic">{p.children}</span>,
  code: ({ inline, children }: CodeProps) =>
    inline === false ? (
      <span className="text-xs font-mono">{children}</span>
    ) : (
      <code className="px-1 rounded bg-[color:var(--border)] font-mono text-xs">{children}</code>
    ),
  pre: (p: ChildrenProps) => <span className="text-xs font-mono">{p.children}</span>,
  a: (p: ChildrenProps) => <span>{p.children}</span>,
  hr: () => <span className="mx-1 text-muted">---</span>,
  table: (p: ChildrenProps) => <span>{p.children}</span>,
  th: (p: ChildrenProps) => <span className="font-semibold">{p.children}</span>,
  td: (p: ChildrenProps) => <span>{p.children}</span>,
};

export const mdRich: Components = {
  p: (p: ChildrenProps) => (
    <p className="my-3 first:mt-0 last:mb-0 leading-7 text-base">{p.children}</p>
  ),
  strong: (p: ChildrenProps) => (
    <strong className="font-semibold text-fg">{p.children}</strong>
  ),
  em: (p: ChildrenProps) => <em className="italic text-fg">{p.children}</em>,
  ul: (p: ChildrenProps) => (
    <ul className="list-disc list-outside pl-6 my-3 space-y-2">{p.children}</ul>
  ),
  ol: (p: ChildrenProps) => (
    <ol className="list-decimal list-outside pl-6 my-3 space-y-2">{p.children}</ol>
  ),
  li: (p: ChildrenProps) => <li className="leading-7 text-base pl-1">{p.children}</li>,
  h1: (p: ChildrenProps) => (
    <h1 className="text-xl font-bold mt-5 mb-3 text-fg leading-8">{p.children}</h1>
  ),
  h2: (p: ChildrenProps) => (
    <h2 className="text-lg font-bold mt-4 mb-2 text-fg leading-7">{p.children}</h2>
  ),
  h3: (p: ChildrenProps) => (
    <h3 className="text-base font-bold mt-3 mb-1.5 text-fg leading-7">{p.children}</h3>
  ),
  blockquote: (p: ChildrenProps) => (
    <blockquote className="border-l-[3px] border-accent pl-4 py-1 my-3 text-muted italic leading-7">
      {p.children}
    </blockquote>
  ),
  code: ({ inline, children }: CodeProps) =>
    inline === false ? (
      <code className="block">{children}</code>
    ) : (
      <code className="px-1.5 py-0.5 rounded bg-[color:var(--border)] text-fg font-mono text-sm">
        {children}
      </code>
    ),
  pre: (p: ChildrenProps) => (
    <pre className="my-3 p-4 rounded-lg bg-[color:var(--border)] overflow-x-auto text-sm font-mono leading-6">
      {p.children}
    </pre>
  ),
  a: (p: AnchorProps) => (
    <a
      href={p.href}
      className="text-accent underline hover:no-underline"
      onClick={(e) => e.preventDefault()}
    >
      {p.children}
    </a>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: (p: ChildrenProps) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{p.children}</table>
    </div>
  ),
  th: (p: ChildrenProps) => (
    <th className="border border-border px-3 py-2 text-left font-semibold bg-[color:var(--border)] text-fg">
      {p.children}
    </th>
  ),
  td: (p: ChildrenProps) => (
    <td className="border border-border px-3 py-2">{p.children}</td>
  ),
};
