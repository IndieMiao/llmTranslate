import { useEffect, useState } from 'react';
import type { ThemeChoice } from '@shared/types';
import { applyTheme, resolveTheme } from '@/lib/theme';
import { ipc } from '@/lib/ipc';

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [isDark, setIsDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    void ipc().settings.get().then((s) => setChoice(s.theme));
    const unsubscribe = ipc().theme.onSystemChanged((e) => setIsDark(e.isDark));
    return () => { unsubscribe(); };
  }, []);

  const resolved = resolveTheme(choice, isDark);
  useEffect(() => { applyTheme(resolved); }, [resolved]);

  async function setTheme(next: ThemeChoice) {
    await ipc().settings.set({ theme: next });
    setChoice(next);
  }
  return { choice, resolved, setTheme };
}
