import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { usePaste } from '@/hooks/usePaste';

function Probe(props: Parameters<typeof usePaste>[0]) {
  usePaste(props);
  return <div data-testid="root" />;
}

describe('usePaste', () => {
  it('routes pasted image to onImage', async () => {
    const onImage = vi.fn();
    const onText = vi.fn();
    const onAudio = vi.fn();
    render(<Probe onImage={onImage} onText={onText} onAudio={onAudio} />);
    const file = new File([new Uint8Array(3)], 'a.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    fireEvent.paste(window, { clipboardData: dt });
    await new Promise((r) => setTimeout(r, 0));
    expect(onImage).toHaveBeenCalled();
  });
  it('routes pasted text to onText', () => {
    const onImage = vi.fn();
    const onText = vi.fn();
    const onAudio = vi.fn();
    render(<Probe onImage={onImage} onText={onText} onAudio={onAudio} />);
    fireEvent.paste(window, { clipboardData: { items: [], files: [], getData: () => '你好' } });
    expect(onText).toHaveBeenCalledWith('你好');
  });
});
