import { useTheme } from '@/hooks/useTheme';

export default function App() {
  useTheme(); // applies on mount, reacts to changes
  return (
    <div className="flex h-full items-center justify-center bg-bg text-fg">
      <h1 className="text-2xl">llmTranslate</h1>
    </div>
  );
}
