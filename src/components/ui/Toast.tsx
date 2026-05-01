import { useEffect, useState } from 'react';
type Toast = { id: number; message: string; kind: 'error' | 'info' };
let id = 0;
const listeners = new Set<(t: Toast) => void>();

export function pushToast(message: string, kind: 'error' | 'info' = 'info') {
  const t: Toast = { id: ++id, message, kind };
  listeners.forEach((fn) => fn(t));
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const fn = (t: Toast) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {items.map((t) => (
        <div key={t.id} className={`px-3 py-2 rounded-md text-sm border ${t.kind === 'error' ? 'border-danger text-danger' : 'border-border text-fg'} bg-bg`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
