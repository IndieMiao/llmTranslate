import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryCard } from '@/components/history/HistoryCard';
import type { HistoryRecord } from '@shared/types';

const favoriteMock = vi.fn(async () => ({ ok: true }));
const deleteMock = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  favoriteMock.mockClear();
  deleteMock.mockClear();
  Object.assign(window, {
    electron: {
      history: {
        favorite: favoriteMock,
        delete: deleteMock,
      },
    },
  });
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
    resultText: 'Hello world',
    assetPath: null,
    favorite: false,
    tokenUsage: null,
    ...over,
  };
}

describe('HistoryCard', () => {
  it('renders mode, languages, source preview, translation preview', () => {
    render(<HistoryCard record={rec()} onOpen={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText(/text/)).toBeInTheDocument();
    expect(screen.getByText(/zh→en/)).toBeInTheDocument();
    expect(screen.getByText('你好世界')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows ★ when favorite', () => {
    render(<HistoryCard record={rec({ favorite: true })} onOpen={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText('★')).toBeInTheDocument();
  });

  it('does not show ★ when not favorite', () => {
    render(<HistoryCard record={rec({ favorite: false })} onOpen={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByText('★')).toBeNull();
  });

  it('clicking the card body calls onOpen with the record', async () => {
    const onOpen = vi.fn();
    render(<HistoryCard record={rec()} onOpen={onOpen} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByTestId('history-card-body'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('clicking footer buttons does not call onOpen', async () => {
    const onOpen = vi.fn();
    render(<HistoryCard record={rec()} onOpen={onOpen} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '复制' }));
    await userEvent.click(screen.getByRole('button', { name: '收藏' }));
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('clicking 收藏 toggles via ipc and calls onChanged', async () => {
    const onChanged = vi.fn();
    render(<HistoryCard record={rec({ favorite: false })} onOpen={vi.fn()} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole('button', { name: '收藏' }));
    expect(favoriteMock).toHaveBeenCalledWith('r1', true);
    expect(onChanged).toHaveBeenCalled();
  });

  it('clicking 取消收藏 sends favorite=false', async () => {
    render(<HistoryCard record={rec({ favorite: true })} onOpen={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '取消收藏' }));
    expect(favoriteMock).toHaveBeenCalledWith('r1', false);
  });

  it('image-mode card without sourceText omits the source preview row', () => {
    render(
      <HistoryCard
        record={rec({ mode: 'image', sourceText: null, assetPath: '/x.png' })}
        onOpen={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('history-card-source')).toBeNull();
  });
});
