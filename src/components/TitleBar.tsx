export function TitleBar() {
  return (
    <div
      className="h-9 flex items-center justify-between px-3 border-b border-border bg-bg select-none"
      style={{ ['-webkit-app-region' as never]: 'drag' } as React.CSSProperties}
    >
      <div className="text-sm font-medium text-fg">llmTranslate</div>
      <div className="flex gap-1" style={{ ['-webkit-app-region' as never]: 'no-drag' } as React.CSSProperties}>
        <button onClick={() => window.electron.app.showWindow()} className="text-xs text-muted px-2 hover:text-fg">_</button>
        <button onClick={() => window.close()} className="text-xs text-muted px-2 hover:text-danger">×</button>
      </div>
    </div>
  );
}
