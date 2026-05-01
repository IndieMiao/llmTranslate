import { useTheme } from '@/hooks/useTheme';
import { AppShell } from '@/components/AppShell';
import { ToastHost } from '@/components/ui/Toast';

export default function App() {
  useTheme();
  return (
    <>
      <AppShell />
      <ToastHost />
    </>
  );
}
