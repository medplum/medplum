// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { DoseSpotIcon } from './DoseSpotIcon';

vi.mock('@medplum/dosespot-react', () => ({
  useDoseSpotNotifications: vi.fn(),
}));

import { useDoseSpotNotifications } from '@medplum/dosespot-react';

describe('DoseSpotIcon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup(): ReturnType<typeof render> {
    return render(
      <MantineProvider>
        <DoseSpotIcon />
      </MantineProvider>
    );
  }

  test('Renders icon without indicator when unreadCount is 0', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(0);
    const { container } = setup();

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  test('Renders icon without indicator when unreadCount is undefined', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(undefined);
    const { container } = setup();

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  test('Renders icon with indicator when unreadCount is greater than 0', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(5);
    const { container } = setup();

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('Formats unreadCount with toLocaleString for large numbers', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(1234);
    setup();

    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  test('Displays correct count for single digit', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(1);
    setup();

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('Displays correct count for double digit', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(42);
    setup();

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('Displays correct count for triple digit', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(999);
    setup();

    expect(screen.getByText('999')).toBeInTheDocument();
  });

  test('Icon is always rendered regardless of unreadCount', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(0);
    const { container, rerender } = setup();

    let icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();

    vi.mocked(useDoseSpotNotifications).mockReturnValue(10);
    rerender(
      <MantineProvider>
        <DoseSpotIcon />
      </MantineProvider>
    );

    icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
