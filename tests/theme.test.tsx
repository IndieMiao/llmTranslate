import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { applyTheme, resolveTheme } from '@/lib/theme';
import { useTheme } from '@/hooks/useTheme';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  (window as unknown as { electron?: unknown }).electron = {
    settings: {
      get: vi.fn().mockResolvedValue({ apiKey: '', model: 'g', theme: 'dark', shortcut: '', languagePair: 'zh-en', history: { maxRecords: 1 } }),
      set: vi.fn().mockImplementation((p) => Promise.resolve({ theme: p.theme })),
    },
    theme: { onSystemChanged: () => () => undefined },
  };
});

describe('theme', () => {
  it('applyTheme sets data-theme attribute', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
  it('resolveTheme honors system isDark', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('useTheme initializes from settings', async () => {
    function Probe() {
      const { resolved } = useTheme();
      return <div data-testid="t">{resolved}</div>;
    }
    await act(async () => { render(<Probe />); });
    expect(screen.getByTestId('t').textContent).toBe('dark');
  });
});
