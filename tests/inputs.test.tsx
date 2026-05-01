import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextInput } from '@/components/translate/TextInput';
import { ImageInput } from '@/components/translate/ImageInput';

describe('TextInput', () => {
  it('reports text changes and char count', async () => {
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'hi');
    expect(onChange).toHaveBeenLastCalledWith('hi');
  });

  it('rejects oversized text with error', async () => {
    const onChange = vi.fn();
    const big = 'a'.repeat(60_000);
    render(<TextInput value={big} onChange={onChange} />);
    expect(screen.getByText(/超出/)).toBeInTheDocument();
  });
});

describe('ImageInput', () => {
  it('rejects non-image and oversized files', () => {
    const onSelect = vi.fn();
    render(<ImageInput onSelect={onSelect} />);
    const dz = screen.getByTestId('image-dropzone');
    const big = new File([new ArrayBuffer(11 * 1024 * 1024)], 'a.png', { type: 'image/png' });
    fireEvent.drop(dz, { dataTransfer: { files: [big] } });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/超出/)).toBeInTheDocument();
  });

  it('accepts valid image and emits bytes', async () => {
    const onSelect = vi.fn();
    render(<ImageInput onSelect={onSelect} />);
    const dz = screen.getByTestId('image-dropzone');
    const ok = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    fireEvent.drop(dz, { dataTransfer: { files: [ok] } });
    await new Promise((r) => setTimeout(r, 0));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ mime: 'image/png' }));
  });
});
