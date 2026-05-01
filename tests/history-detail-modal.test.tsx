import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryDetailModal } from '@/components/history/HistoryDetailModal';
import type { HistoryRecord } from '@shared/types';

const readAssetMock = vi.fn();
const favoriteMock = vi.fn(async () => ({ ok: true }));
const deleteMock = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  readAssetMock.mockReset();
  favoriteMock.mockClear();
  deleteMock.mockClear();
  // @ts-expect-error stub
  window.electron = {
    history: {
      favorite: favoriteMock,
      delete: deleteMock,
      readAsset: readAssetMock,
    },
  };
  // @ts-expect-error stub
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function rec(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'r1',
    createdAt: new Date('2026-05-01T08:30:00Z').getTime(),
    mode: 'text',
    sourceLang: 'zh',
    targetLang: 'en',
    sourceText: '你好世界',
    resultText: '# Hello\n\nworld',
    assetPath: null,
    favorite: false,
    tokenUsage: null,
    ...over,
  };
}

describe('HistoryDetailModal', () => {
  it('renders nothing when record is null', () => {
    const { container } = render(
      <HistoryDetailModal record={null} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders full markdown translation (heading element)', () => {
    render(<HistoryDetailModal record={rec()} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument();
  });

  it('renders source text section when sourceText present', () => {
    render(<HistoryDetailModal record={rec()} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText('原文')).toBeInTheDocument();
    expect(screen.getByText('你好世界')).toBeInTheDocument();
  });

  it('does not call readAsset for text records', () => {
    render(<HistoryDetailModal record={rec()} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(readAssetMock).not.toHaveBeenCalled();
  });

  it('fetches and renders image for image records', async () => {
    readAssetMock.mockResolvedValue({ mime: 'image/png', dataUrl: 'data:image/png;base64,AAA' });
    render(
      <HistoryDetailModal
        record={rec({ mode: 'image', assetPath: '/p.png', sourceText: null })}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await waitFor(() => expect(readAssetMock).toHaveBeenCalledWith('r1'));
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAA');
  });

  it('does not render <img> when assetPath is null', () => {
    render(
      <HistoryDetailModal
        record={rec({ mode: 'image', assetPath: null, sourceText: null })}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(readAssetMock).not.toHaveBeenCalled();
  });

  it('shows audio filename only for audio records', () => {
    render(
      <HistoryDetailModal
        record={rec({ mode: 'audio', assetPath: '/some/dir/voice.mp3', sourceText: null })}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText('voice.mp3')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(readAssetMock).not.toHaveBeenCalled();
  });

  it('ESC calls onClose', async () => {
    const onClose = vi.fn();
    render(<HistoryDetailModal record={rec()} onClose={onClose} onChanged={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the overlay calls onClose; clicking inside does not', async () => {
    const onClose = vi.fn();
    render(<HistoryDetailModal record={rec()} onClose={onClose} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByTestId('history-modal-panel'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('history-modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('delete confirms, calls ipc, then closes and notifies parent', async () => {
    const onClose = vi.fn();
    const onChanged = vi.fn();
    render(<HistoryDetailModal record={rec()} onClose={onClose} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(deleteMock).toHaveBeenCalledWith('r1');
    expect(onClose).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });
});
