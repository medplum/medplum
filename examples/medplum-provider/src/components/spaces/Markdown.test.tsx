// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { render, screen } from '../../test-utils/render';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  test('Renders plain paragraph text', () => {
    render(<Markdown>Just some prose.</Markdown>);

    const paragraph = screen.getByText('Just some prose.');
    expect(paragraph).toBeInTheDocument();
    expect(paragraph.tagName).toBe('P');
  });

  test('Renders nothing for empty content', () => {
    const { container } = render(<Markdown>{''}</Markdown>);

    // MantineProvider injects <style> tags, so assert on rendered markdown output instead.
    expect(container.querySelectorAll('p, ul, ol, pre, code, table')).toHaveLength(0);
  });

  test('Renders links that open in a new tab', () => {
    render(<Markdown>{'See [Medplum](https://www.medplum.com) for details.'}</Markdown>);

    const anchor = screen.getByRole('link', { name: 'Medplum' });
    expect(anchor).toHaveAttribute('href', 'https://www.medplum.com');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('Renders bold and italic as Mantine text spans', () => {
    render(<Markdown>{'**bold text** and *italic text*'}</Markdown>);

    expect(screen.getByText('bold text').tagName).toBe('SPAN');
    expect(screen.getByText('italic text').tagName).toBe('SPAN');
  });

  test('Distinguishes inline code from fenced code blocks', () => {
    render(<Markdown>{'Call `readResource` first.\n\n```ts\nconst answer = 42;\n```\n'}</Markdown>);

    const inline = screen.getByText('readResource');
    expect(inline.tagName).toBe('CODE');
    expect(inline).not.toHaveAttribute('data-block');

    // `Code block` renders a <pre>, so the block variant is distinguishable from inline code.
    const block = screen.getByText('const answer = 42;');
    expect(block.tagName).toBe('PRE');
    expect(block).toHaveAttribute('data-block', 'true');
  });

  test('Maps headings down to Mantine Title orders 3 through 6', () => {
    render(<Markdown>{'# One\n\n## Two\n\n### Three\n\n#### Four\n'}</Markdown>);

    // h1..h4 are demoted so markdown headings never outrank the surrounding page chrome.
    expect(screen.getByText('One').tagName).toBe('H3');
    expect(screen.getByText('Two').tagName).toBe('H4');
    expect(screen.getByText('Three').tagName).toBe('H5');
    expect(screen.getByText('Four').tagName).toBe('H6');
  });

  test('Renders unordered lists', () => {
    render(<Markdown>{'- First item\n- Second item\n'}</Markdown>);

    expect(screen.getByText('First item').closest('ul')).toBeInTheDocument();
    expect(screen.getByText('First item').closest('li')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
  });

  test('Renders ordered lists', () => {
    render(<Markdown>{'1. Step one\n2. Step two\n'}</Markdown>);

    expect(screen.getByText('Step one').closest('ol')).toBeInTheDocument();
    expect(screen.getByText('Step two')).toBeInTheDocument();
  });

  test('Renders GFM tables', () => {
    render(<Markdown>{'| Code | Display |\n| --- | --- |\n| C48542 | Tablet |\n'}</Markdown>);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'C48542' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Tablet' })).toBeInTheDocument();
  });

  test('Renders GFM strikethrough', () => {
    render(<Markdown>{'~~retired~~ text'}</Markdown>);

    expect(screen.getByText('retired').tagName).toBe('DEL');
  });
});
