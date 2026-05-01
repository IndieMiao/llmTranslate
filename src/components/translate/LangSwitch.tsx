import type { LangCode } from '@shared/types';

const LABEL: Record<LangCode, string> = { zh: '中', en: '英' };

interface Props {
  source: LangCode;
  target: LangCode;
  onChange: (next: { source: LangCode; target: LangCode }) => void;
}

export function LangSwitch({ source, target, onChange }: Props) {
  return (
    <button
      onClick={() => onChange({ source: target, target: source })}
      className="px-3 h-9 rounded-md border border-border text-sm text-fg hover:bg-[color:var(--border)]"
    >
      {LABEL[source]} → {LABEL[target]} ⇄
    </button>
  );
}
