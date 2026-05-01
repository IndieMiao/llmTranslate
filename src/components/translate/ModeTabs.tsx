import type { TranslateMode } from '@shared/types';

const ITEMS: { id: TranslateMode; label: string }[] = [
  { id: 'text', label: '文本' },
  { id: 'image', label: '图片' },
  { id: 'audio', label: '音频' },
];

interface Props {
  current: TranslateMode;
  onChange: (m: TranslateMode) => void;
}

export function ModeTabs({ current, onChange }: Props) {
  return (
    <div role="tablist" className="inline-flex border border-border rounded-md overflow-hidden">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={current === it.id}
          onClick={() => onChange(it.id)}
          className={`px-3 h-9 text-sm ${current === it.id ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
