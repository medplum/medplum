// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { DoseSpotIcon } from './DoseSpotIcon';
import { DoseSpotNavbarLink, NavbarLinkWithBadge } from './NavbarNotificationLink';

vi.mock('@medplum/dosespot-react', () => ({
  useDoseSpotNotifications: vi.fn(),
}));

import { useDoseSpotNotifications } from '@medplum/dosespot-react';

describe('DoseSpotIcon', () => {
  function setup(): ReturnType<typeof render> {
    return render(
      <MantineProvider>
        <DoseSpotIcon />
      </MantineProvider>
    );
  }

  test('Renders the pill icon', () => {
    const { container } = setup();

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
  });

  test('Renders icon with correct size', () => {
    const { container } = setup();

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toHaveAttribute('width', '20');
    expect(icon).toHaveAttribute('height', '20');
  });
});

describe('NavbarLinkWithBadge', () => {
  function setup(count: number): ReturnType<typeof render> {
    return render(
      <MantineProvider>
        <NavbarLinkWithBadge iconComponent={<DoseSpotIcon />} count={count} />
      </MantineProvider>
    );
  }

  test('Renders icon without indicator when count is 0', () => {
    const { container } = setup(0);

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  test('Renders icon with indicator when count is greater than 0', () => {
    const { container } = setup(5);

    const icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('Formats count with toLocaleString for large numbers', () => {
    setup(1234);

    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  test('Displays correct count for single digit', () => {
    setup(1);

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('Displays correct count for double digit', () => {
    setup(42);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('Displays correct count for triple digit', () => {
    setup(999);

    expect(screen.getByText('999')).toBeInTheDocument();
  });
});

describe('DoseSpotNavbarLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup(): ReturnType<typeof render> {
    return render(
      <MantineProvider>
        <DoseSpotNavbarLink iconComponent={<DoseSpotIcon />} />
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

  test('Icon is always rendered regardless of unreadCount', () => {
    vi.mocked(useDoseSpotNotifications).mockReturnValue(0);
    const { container, rerender } = setup();

    let icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();

    vi.mocked(useDoseSpotNotifications).mockReturnValue(10);
    rerender(
      <MantineProvider>
        <DoseSpotNavbarLink iconComponent={<DoseSpotIcon />} />
      </MantineProvider>
    );

    icon = container.querySelector('svg.tabler-icon-pill');
    expect(icon).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
