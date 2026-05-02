import { createContext, useContext, type ReactNode } from 'react';
import { useTranslate } from './useTranslate';

type TranslateValue = ReturnType<typeof useTranslate>;

const TranslateContext = createContext<TranslateValue | null>(null);

export function TranslateProvider({ children }: { children: ReactNode }) {
  const value = useTranslate();
  return <TranslateContext.Provider value={value}>{children}</TranslateContext.Provider>;
}

export function useTranslateContext(): TranslateValue {
  const v = useContext(TranslateContext);
  if (!v) throw new Error('useTranslateContext must be used inside <TranslateProvider>');
  return v;
}
