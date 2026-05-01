import { useEffect } from 'react';
import type { SelectedFile } from '@/components/translate/ImageInput';

interface Opts {
  onImage: (f: SelectedFile) => void;
  onAudio: (f: SelectedFile) => void;
  onText: (s: string) => void;
}

export function usePaste({ onImage, onAudio, onText }: Opts) {
  useEffect(() => {
    async function handler(e: ClipboardEvent) {
      const dt = e.clipboardData;
      if (!dt) return;
      // Image first
      for (const it of Array.from(dt.items ?? [])) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            onImage({ bytes, mime: file.type, name: file.name || 'pasted.png', previewUrl: URL.createObjectURL(file) });
            return;
          }
        }
      }
      // Audio file
      for (const f of Array.from(dt.files ?? [])) {
        if (f.type.startsWith('audio/')) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          onAudio({ bytes, mime: f.type, name: f.name });
          return;
        }
      }
      const text = dt.getData('text/plain');
      if (text) onText(text);
    }
    window.addEventListener('paste', handler as unknown as EventListener);
    return () => window.removeEventListener('paste', handler as unknown as EventListener);
  }, [onImage, onAudio, onText]);
}
