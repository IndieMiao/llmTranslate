import type { ErrorCode } from '@shared/types';
import { pushToast } from '@/components/ui/Toast';

export function showErrorByCode(code: ErrorCode | undefined, message: string): void {
  if (!code) return;
  pushToast(message, 'error');
}
