import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeTabs } from '@/components/translate/ModeTabs';

describe('ModeTabs', () => {
  it('renders 3 modes and emits change', async () => {
    const onChange = vi.fn();
    render(<ModeTabs current="text" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: '图片' }));
    expect(onChange).toHaveBeenCalledWith('image');
  });
});
