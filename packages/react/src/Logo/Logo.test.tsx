// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { Logo } from './Logo';

describe('Logo', () => {
  test('Renders', () => {
    render(<Logo size={100} />);
    expect(screen.getByTitle('Medplum Logo')).toBeDefined();
  });

  test('Renders with overrideUrl', async () => {
    (import.meta.env as any).MEDPLUM_LOGO_URL = 'https://example.com/custom-logo.png';

    jest.resetModules();
    const { Logo: LogoWithOverride } = await import('./Logo');

    render(<LogoWithOverride size={100} />);
    const img = screen.getByAltText('Logo');
    expect(img).toBeDefined();
    expect(img).toHaveAttribute('src', 'https://example.com/custom-logo.png');
    expect(img).toHaveStyle({ maxHeight: '100px' });
  });
});
