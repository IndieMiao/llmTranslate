import { useTheme } from '@/hooks/useTheme';
import { AppShell } from '@/components/AppShell';

export default function App() {
  useTheme();
  return <AppShell />;
}
