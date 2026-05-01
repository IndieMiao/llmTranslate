type Page = 'translate' | 'history' | 'settings';
interface Props {
  current: Page;
  onChange: (p: Page) => void;
}

const items: { id: Page; label: string }[] = [
  { id: 'translate', label: '翻译' },
  { id: 'history', label: '历史' },
  { id: 'settings', label: '设置' },
];

export function Sidebar({ current, onChange }: Props) {
  return (
    <nav className="w-44 border-r border-border bg-bg flex flex-col py-2">
      {items.map((it) => (
        <button
          key={it.id}
          className={`text-left px-4 py-2 text-sm ${
            current === it.id ? 'text-fg bg-[color:var(--border)]' : 'text-muted hover:text-fg'
          }`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}
