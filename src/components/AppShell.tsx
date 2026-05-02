import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import Translate from '@/pages/Translate';
import History from '@/pages/History';
import Settings from '@/pages/Settings';
import { TranslateProvider } from '@/hooks/TranslateContext';

export function AppShell() {
  const [page, setPage] = useState<'translate' | 'history' | 'settings'>('translate');
  return (
    <TranslateProvider>
      <div className="flex h-full flex-col bg-bg text-fg">
        <TitleBar />
        <div className="flex flex-1 min-h-0">
          <Sidebar current={page} onChange={setPage} />
          <main className="flex-1 overflow-hidden">
            {page === 'translate' && <Translate />}
            {page === 'history' && <History />}
            {page === 'settings' && <Settings />}
          </main>
        </div>
      </div>
    </TranslateProvider>
  );
}
