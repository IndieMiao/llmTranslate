import { useState, useEffect } from 'react';
import { FILE_LIMITS } from '@shared/types';

interface Props { value: string; onChange: (next: string) => void; }

export function TextInput({ value, onChange }: Props) {
  const [internal, setInternal] = useState(value);

  useEffect(() => { setInternal(value); }, [value]);

  const over = internal.length > FILE_LIMITS.textMaxChars;

  function handleChange(next: string) {
    setInternal(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className="w-full min-h-[160px] rounded-md border border-border bg-bg text-fg p-3 outline-none focus:border-accent resize-none"
        placeholder="输入要翻译的文字（Ctrl+Enter 翻译，Esc 取消）"
        value={internal}
        onChange={(e) => handleChange(e.target.value)}
      />
      <div className="text-xs text-muted flex justify-between">
        <span>{internal.length} / {FILE_LIMITS.textMaxChars}</span>
        {over && <span className="text-danger">超出最大长度</span>}
      </div>
    </div>
  );
}
