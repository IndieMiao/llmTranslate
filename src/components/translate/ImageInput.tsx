import { useState } from 'react';
import { FILE_LIMITS } from '@shared/types';

export interface SelectedFile { bytes: Uint8Array; mime: string; name: string; previewUrl?: string; }
interface Props { onSelect: (f: SelectedFile) => void; }

export function ImageInput({ onSelect }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);

  async function accept(file: File) {
    setError(null);
    if (!(FILE_LIMITS.imageMimes as readonly string[]).includes(file.type)) {
      setError('不支持的图片类型');
      return;
    }
    if (file.size > FILE_LIMITS.imageMaxBytes) {
      setError('文件超出 10MB 限制');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const previewUrl = URL.createObjectURL(file);
    const f = { bytes, mime: file.type, name: file.name, previewUrl };
    setSelected(f);
    onSelect(f);
  }

  return (
    <div
      data-testid="image-dropzone"
      className="border-2 border-dashed border-border rounded-md p-6 text-center cursor-pointer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void accept(f); }}
      onClick={() => document.getElementById('img-file-input')?.click()}
    >
      <input id="img-file-input" type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); }} />
      {selected ? (
        <img src={selected.previewUrl} alt={selected.name} className="max-h-48 mx-auto rounded" />
      ) : (
        <div className="text-muted text-sm">拖拽 / 粘贴 / 点击 上传图片（PNG/JPEG/WEBP/GIF, ≤10MB）</div>
      )}
      {error && <div className="mt-2 text-danger text-xs">{error}</div>}
    </div>
  );
}
