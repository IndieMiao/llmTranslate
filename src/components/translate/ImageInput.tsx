import { useState, useEffect } from 'react';
import { FILE_LIMITS } from '@shared/types';
import { Lightbox } from '@/components/ui/Lightbox';

export interface SelectedFile { bytes: Uint8Array; mime: string; name: string; previewUrl?: string; }
interface Props { file?: SelectedFile | null; onSelect: (f: SelectedFile) => void; }

export function ImageInput({ file, onSelect }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(file ?? null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => { setSelected(file ?? null); }, [file]);

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
    <>
      <div
        data-testid="image-dropzone"
        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-muted transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void accept(f); }}
        onClick={() => document.getElementById('img-file-input')?.click()}
      >
        <input id="img-file-input" type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); }} />
        {selected ? (
          <div className="flex flex-col items-center gap-2">
            <img
              src={selected.previewUrl}
              alt={selected.name}
              className="max-h-36 rounded-md cursor-zoom-in shadow-sm hover:shadow-md transition-shadow"
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
            />
            <span className="text-xs text-muted">点击图片放大预览 · 点击区域重新选择</span>
          </div>
        ) : (
          <div className="text-muted text-sm py-4">拖拽 / 粘贴 / 点击 上传图片（PNG / JPEG / WEBP / GIF，≤10MB）</div>
        )}
        {error && <div className="mt-2 text-danger text-xs">{error}</div>}
      </div>
      <Lightbox
        open={lightboxOpen}
        src={selected?.previewUrl ?? ''}
        alt={selected?.name}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
