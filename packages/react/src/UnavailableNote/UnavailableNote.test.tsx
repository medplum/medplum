// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { UnavailableNote } from './UnavailableNote';

const message = 'Value set http://example.com/my-value-set is unavailable';

describe('UnavailableNote', () => {
  test('Renders text with the message behind an accessible trigger', () => {
    render(<UnavailableNote text="Suggestions unavailable" message={message} />);
    expect(screen.getByText('Suggestions unavailable')).toBeInTheDocument();
    expect(screen.getByLabelText(`Why is this unavailable? ${message}`)).toBeInTheDocument();
  });

  test.each([
    ['warning', 'var(--mantine-color-yellow-9)'],
    ['error', 'var(--mantine-color-red-text)'],
  ] as const)('Severity %s sets the color', (severity, expected) => {
    render(<UnavailableNote text="Note" severity={severity} message={message} />);
    expect(screen.getByText('Note')).toHaveStyle({ color: expected });
  });

  test('Defaults to warning severity', () => {
    render(<UnavailableNote text="Note" message={message} />);
    expect(screen.getByText('Note')).toHaveStyle({ color: 'var(--mantine-color-yellow-9)' });
  });

  test('Color overrides severity', () => {
    render(<UnavailableNote text="Note" severity="error" color="blue" message={message} />);
    expect(screen.getByText('Note')).toHaveStyle({ color: 'var(--mantine-color-blue-text)' });
  });
});
