import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LangSwitch } from '@/components/translate/LangSwitch';

describe('LangSwitch', () => {
  it('shows current direction and reverses on click', async () => {
    const onChange = vi.fn();
    render(<LangSwitch source="zh" target="en" onChange={onChange} />);
    expect(screen.getByText(/中.*→.*英/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith({ source: 'en', target: 'zh' });
  });
});
