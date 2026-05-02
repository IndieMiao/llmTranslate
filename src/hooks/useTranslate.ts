import { useEffect, useRef, useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import type { TranslateMode, LangCode, ErrorCode } from '@shared/types';
import { ipc } from '@/lib/ipc';

export type Status = 'idle' | 'streaming' | 'ok' | 'cancelled' | 'error';

export interface RunArgs {
  mode: TranslateMode;
  sourceLang: LangCode;
  targetLang: LangCode;
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
}

export function useTranslate() {
  const [id, setId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [errorCode, setErrorCode] = useState<ErrorCode | undefined>();
  const lastArgs = useRef<RunArgs | null>(null);

  useEffect(() => {
    const offChunk = ipc().translate.onChunk((e) => { if (e.id === id) setText((t) => t + e.delta); });
    const offDone = ipc().translate.onDone((e) => {
      if (e.id !== id) return;
      setStatus(e.status === 'cancelled' ? 'cancelled' : 'ok');
      if (e.status === 'ok') setText(e.fullText);
    });
    const offError = ipc().translate.onError((e) => {
      if (e.id !== id) return;
      setStatus('error');
      setErrorMessage(e.message);
      setErrorCode(e.code);
    });
    return () => { offChunk(); offDone(); offError(); };
  }, [id]);

  const run = useCallback(async (args: RunArgs) => {
    const newId = nanoid();
    lastArgs.current = args;
    setId(newId);
    setText('');
    setStatus('streaming');
    setErrorMessage(undefined);
    setErrorCode(undefined);
    try {
      await ipc().translate.run({ id: newId, ...args });
    } catch (err) {
      const e = err as { code?: ErrorCode; message?: string };
      setStatus('error');
      setErrorCode(e.code ?? 'INTERNAL');
      setErrorMessage(e.message ?? '提交失败');
    }
  }, []);

  const cancel = useCallback(async () => {
    if (id && status === 'streaming') await ipc().translate.cancel(id);
  }, [id, status]);

  const retry = useCallback(async () => {
    if (lastArgs.current) await run(lastArgs.current);
  }, [run]);

  const reset = useCallback(() => {
    setId(null);
    setText('');
    setStatus('idle');
    setErrorMessage(undefined);
    setErrorCode(undefined);
  }, []);

  return { id, text, status, errorMessage, errorCode, run, cancel, retry, reset };
}
