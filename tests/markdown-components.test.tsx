import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { mdCompact, mdRich } from '@/components/markdown/components';

describe('markdown components', () => {
  it('mdRich renders a paragraph element', () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdRich as never}>
        hello
      </ReactMarkdown>,
    );
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('mdCompact renders a list item as inline span (not <li>)', () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdCompact as never}>
        {'- item'}
      </ReactMarkdown>,
    );
    expect(container.querySelector('li')).toBeNull();
    expect(container.textContent).toContain('item');
  });

  it('mdRich renders headings', () => {
    const { container } = render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdRich as never}>
        {'# big'}
      </ReactMarkdown>,
    );
    expect(container.querySelector('h1')?.textContent).toBe('big');
  });
});
