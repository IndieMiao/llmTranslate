import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTranslate } from '@/hooks/useTranslate';

let chunkCb: ((e: { id: string; delta: string }) => void) | null = null;
let doneCb: ((e: { id: string; fullText: string; status: string }) => void) | null = null;
let errorCb: ((e: { id: string; code: string; message: string }) => void) | null = null;

beforeEach(() => {
  chunkCb = null; doneCb = null; errorCb = null;
  (window as unknown as { electron?: unknown }).electron = {
    translate: {
      run: vi.fn().mockResolvedValue({ accepted: true }),
      cancel: vi.fn().mockResolvedValue({ cancelled: true }),
      onChunk: (cb: typeof chunkCb) => { chunkCb = cb; return () => undefined; },
      onDone: (cb: typeof doneCb) => { doneCb = cb; return () => undefined; },
      onError: (cb: typeof errorCb) => { errorCb = cb; return () => undefined; },
    },
  };
});

describe('useTranslate', () => {
  it('accumulates chunks and reaches ok', async () => {
    const { result } = renderHook(() => useTranslate());
    await act(async () => { await result.current.run({ mode: 'text', sourceLang: 'zh', targetLang: 'en', text: 'x' }); });
    act(() => { chunkCb!({ id: result.current.id!, delta: 'he' }); });
    act(() => { chunkCb!({ id: result.current.id!, delta: 'llo' }); });
    expect(result.current.text).toBe('hello');
    expect(result.current.status).toBe('streaming');
    act(() => { doneCb!({ id: result.current.id!, fullText: 'hello', status: 'ok' }); });
    expect(result.current.status).toBe('ok');
  });

  it('error path sets status=error with message', async () => {
    const { result } = renderHook(() => useTranslate());
    await act(async () => { await result.current.run({ mode: 'text', sourceLang: 'zh', targetLang: 'en', text: 'x' }); });
    act(() => { errorCb!({ id: result.current.id!, code: 'NETWORK', message: '网络异常' }); });
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('网络异常');
  });
});
