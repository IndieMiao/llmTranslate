import { useState } from 'react';
import { FILE_LIMITS } from '@shared/types';
import type { SelectedFile } from './ImageInput';

interface Props { onSelect: (f: SelectedFile) => void; }

export function AudioInput({ onSelect }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);

  async function accept(file: File) {
    setError(null);
    if (!(FILE_LIMITS.audioMimes as readonly string[]).includes(file.type)) {
      setError('不支持的音频类型');
      return;
    }
    if (file.size > FILE_LIMITS.audioMaxBytes) {
      setError('文件超出 20MB 限制');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const f: SelectedFile = { bytes, mime: file.type, name: file.name };
    setSelected(f);
    onSelect(f);
  }

  return (
    <div
      data-testid="audio-dropzone"
      className="border-2 border-dashed border-border rounded-md p-6 text-center cursor-pointer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void accept(f); }}
      onClick={() => document.getElementById('audio-file-input')?.click()}
    >
      <input id="audio-file-input" type="file" accept="audio/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); }} />
      {selected ? <div className="text-fg text-sm">{selected.name}</div> :
        <div className="text-muted text-sm">拖拽 / 点击 上传音频（MP3/WAV/M4A/OGG, ≤20MB）</div>}
      {error && <div className="mt-2 text-danger text-xs">{error}</div>}
    </div>
  );
}
