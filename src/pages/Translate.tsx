import { useEffect, useState } from 'react';
import { LangSwitch } from '@/components/translate/LangSwitch';
import { ModeTabs } from '@/components/translate/ModeTabs';
import { TextInput } from '@/components/translate/TextInput';
import { ImageInput, type SelectedFile } from '@/components/translate/ImageInput';
import { AudioInput } from '@/components/translate/AudioInput';
import { TranslationView } from '@/components/translate/TranslationView';
import { useTranslate } from '@/hooks/useTranslate';
import { usePaste } from '@/hooks/usePaste';
import { showErrorByCode } from '@/hooks/useErrorHandler';
import { ipc } from '@/lib/ipc';
import type { LangCode, TranslateMode } from '@shared/types';

export default function Translate() {
  const [mode, setMode] = useState<TranslateMode>('text');
  const [src, setSrc] = useState<LangCode>('zh');
  const [tgt, setTgt] = useState<LangCode>('en');
  const [text, setText] = useState('');
  const [file, setFile] = useState<SelectedFile | null>(null);
  const t = useTranslate();

  useEffect(() => {
    void ipc().settings.get().then((s) => {
      const [a, b] = s.languagePair.split('-') as [LangCode, LangCode];
      setSrc(a); setTgt(b);
    });
  }, []);

  useEffect(() => {
    const off1 = window.electron.app.onFocusInput(() => {
      document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    });
    const off2 = window.electron.app.onQuickTranslate(({ text }) => {
      setMode('text'); setText(text);
    });
    return () => { off1(); off2(); };
  }, []);

  useEffect(() => {
    if (t.status === 'error') showErrorByCode(t.errorCode, t.errorMessage ?? '错误');
  }, [t.status, t.errorCode, t.errorMessage]);

  usePaste({
    onText: (s) => { setMode('text'); setText(s); },
    onImage: (f) => { setMode('image'); setFile(f); },
    onAudio: (f) => { setMode('audio'); setFile(f); },
  });

  function canSubmit(): boolean {
    if (mode === 'text') return text.trim().length > 0;
    return !!file;
  }

  async function submit() {
    if (!canSubmit()) return;
    if (mode === 'text') await t.run({ mode, sourceLang: src, targetLang: tgt, text });
    else if (file) await t.run({ mode, sourceLang: src, targetLang: tgt, bytes: file.bytes, mime: file.mime });
  }

  function onLangChange(next: { source: LangCode; target: LangCode }) {
    setSrc(next.source); setTgt(next.target);
    void ipc().settings.set({ languagePair: `${next.source}-${next.target}` });
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'Enter') void submit();
      else if (e.key === 'Escape' && t.status === 'streaming') void t.cancel();
      else if (e.ctrlKey && e.key.toLowerCase() === 'l') onLangChange({ source: tgt, target: src });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="p-6 flex flex-col gap-3 h-full overflow-auto">
      <div className="flex gap-3 items-center">
        <LangSwitch source={src} target={tgt} onChange={onLangChange} />
        <ModeTabs current={mode} onChange={setMode} />
      </div>

      {mode === 'text' && <TextInput value={text} onChange={setText} />}
      {mode === 'image' && <ImageInput onSelect={setFile} />}
      {mode === 'audio' && <AudioInput onSelect={setFile} />}

      <div className="flex gap-2">
        <button
          className="px-4 h-9 rounded-md bg-accent text-accent-fg disabled:opacity-50"
          disabled={!canSubmit() || t.status === 'streaming'}
          onClick={submit}
        >
          {t.status === 'streaming' ? '翻译中…' : '翻译'}
        </button>
        <button
          className="px-4 h-9 rounded-md border border-border text-fg"
          onClick={() => { setText(''); setFile(null); }}
        >
          清空
        </button>
      </div>

      <TranslationView
        text={t.text}
        status={t.status === 'idle' ? 'idle' : t.status}
        errorMessage={t.errorMessage}
        onCopy={() => void navigator.clipboard.writeText(t.text)}
        onFavorite={() => { if (t.id) void ipc().history.favorite(t.id, true); }}
        onRetranslate={() => void t.retry()}
      />
    </div>
  );
}
