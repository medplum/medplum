// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Logo } from './Logo';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

test('renders the default logo when no image is configured', () => {
  vi.stubEnv('MEDPLUM_LOGO_URL', '');
  vi.stubEnv('MEDPLUM_LOGO_ALT', 'Foo Medical');
  render(
    <MantineProvider>
      <Logo width={240} />
    </MantineProvider>
  );
  expect(screen.getByRole('img', { name: 'Foo Medical' }).tagName).toBe('svg');
});

test('renders a configured image with its accessible label', () => {
  vi.stubEnv('MEDPLUM_LOGO_URL', '/practice.png');
  vi.stubEnv('MEDPLUM_LOGO_ALT', 'Example Practice');
  render(
    <MantineProvider>
      <Logo width={240} />
    </MantineProvider>
  );
  const image = screen.getByRole('img', { name: 'Example Practice' });
  expect(image.getAttribute('src')).toBe('/practice.png');
  expect(image.getAttribute('width')).toBe('240');
  expect(image.style.height).toBe('auto');
});

test('explicit props override the configured image and label', () => {
  vi.stubEnv('MEDPLUM_LOGO_URL', '/practice.png');
  vi.stubEnv('MEDPLUM_LOGO_ALT', 'Example Practice');
  render(
    <MantineProvider>
      <Logo width={120} src="/other.png" alt="Other Practice" />
    </MantineProvider>
  );
  expect(screen.getByRole('img', { name: 'Other Practice' }).getAttribute('src')).toBe('/other.png');
});
