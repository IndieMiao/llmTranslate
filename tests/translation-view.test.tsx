import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranslationView } from '@/components/translate/TranslationView';

describe('TranslationView', () => {
  it('renders streaming text with caret while streaming', () => {
    render(<TranslationView text="hel" status="streaming" onCopy={vi.fn()} onFavorite={vi.fn()} onRetranslate={vi.fn()} />);
    expect(screen.getByText('hel')).toBeInTheDocument();
    expect(screen.getByTestId('caret')).toBeInTheDocument();
  });
  it('shows actions only after status=ok', async () => {
    const onCopy = vi.fn();
    render(<TranslationView text="hello" status="ok" onCopy={onCopy} onFavorite={vi.fn()} onRetranslate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(onCopy).toHaveBeenCalled();
  });
  it('renders error when status=error', () => {
    render(<TranslationView text="" status="error" errorMessage="API key 无效" onCopy={vi.fn()} onFavorite={vi.fn()} onRetranslate={vi.fn()} />);
    expect(screen.getByText('API key 无效')).toBeInTheDocument();
  });
  it('shows cancelled tag when status=cancelled', () => {
    render(<TranslationView text="hel" status="cancelled" onCopy={vi.fn()} onFavorite={vi.fn()} onRetranslate={vi.fn()} />);
    expect(screen.getByText(/已取消/)).toBeInTheDocument();
  });
});
