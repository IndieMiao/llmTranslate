import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranslateProvider, useTranslateContext } from '@/hooks/TranslateContext';

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

function Trigger() {
  const t = useTranslateContext();
  return (
    <button
      data-testid="run"
      onClick={() => void t.run({ mode: 'text', sourceLang: 'zh', targetLang: 'en', text: 'x' })}
    >
      run
    </button>
  );
}

function Display() {
  const t = useTranslateContext();
  return (
    <div>
      <span data-testid="status">{t.status}</span>
      <span data-testid="text">{t.text}</span>
      <span data-testid="id">{t.id ?? ''}</span>
    </div>
  );
}

describe('TranslateContext', () => {
  it('shares state across consumers and survives consumer unmount', async () => {
    function Page({ show }: { show: 'a' | 'b' }) {
      return (
        <TranslateProvider>
          <Trigger />
          {show === 'a' ? <Display /> : <span data-testid="other">other</span>}
        </TranslateProvider>
      );
    }

    const { rerender } = render(<Page show="a" />);
    await userEvent.click(screen.getByTestId('run'));
    expect(screen.getByTestId('status').textContent).toBe('streaming');
    const id = screen.getByTestId('id').textContent;

    // Switch to "other page" — Display unmounts
    rerender(<Page show="b" />);
    expect(screen.queryByTestId('status')).toBeNull();

    // Stream chunk arrives while Display is unmounted — provider still holds the listener
    act(() => { chunkCb!({ id: id!, delta: 'hello' }); });
    act(() => { doneCb!({ id: id!, fullText: 'hello', status: 'ok' }); });

    // Switch back — state preserved
    rerender(<Page show="a" />);
    expect(screen.getByTestId('text').textContent).toBe('hello');
    expect(screen.getByTestId('status').textContent).toBe('ok');
  });

  it('throws a clear error when used outside the provider', () => {
    function Bad() {
      useTranslateContext();
      return null;
    }
    // Suppress React's error log noise for this expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Bad />)).toThrow(/inside <TranslateProvider>/);
    spy.mockRestore();
  });
});
