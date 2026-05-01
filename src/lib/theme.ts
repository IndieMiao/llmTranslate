import type { ThemeChoice } from '@shared/types';

export function applyTheme(resolved: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function resolveTheme(choice: ThemeChoice, isDark: boolean): 'dark' | 'light' {
  if (choice === 'system') return isDark ? 'dark' : 'light';
  return choice;
}
