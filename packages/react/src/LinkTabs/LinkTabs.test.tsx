// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Mocked } from 'vitest';
import type * as MedplumCore from '@medplum/core';
import { locationUtils } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { LinkTabs } from './LinkTabs';

const medplum = new MockClient();
const navigateMock = vi.fn();

vi.mock('@medplum/core', async (importOriginal) => ({
  ...(await importOriginal<typeof MedplumCore>()),
  locationUtils: {
    getPathname: vi.fn(),
  },
}));

const mockLocationUtils = locationUtils as Mocked<typeof locationUtils>;

describe('LinkTabs', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mockLocationUtils.getPathname.mockReturnValue('/patient/123/overview');
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps = {
    baseUrl: '/patient/123',
    tabs: ['Overview', 'Timeline', 'Details'],
  };

  function setup(props = {}, initialUrl = '/patient/123/overview'): void {
    render(
      <MemoryRouter initialEntries={[initialUrl]} initialIndex={0}>
        <MedplumProvider medplum={medplum} navigate={navigateMock}>
          <LinkTabs {...defaultProps} {...props} />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('renders tabs correctly', () => {
    setup();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument();
  });

  test('initializes with correct tab based on current URL', () => {
    mockLocationUtils.getPathname.mockReturnValue('/patient/123/timeline');
    setup();

    const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
    expect(timelineTab).toHaveAttribute('aria-selected', 'true');
  });

  test('initializes with first tab when current path does not match any tab', () => {
    mockLocationUtils.getPathname.mockReturnValue('/patient/123/unknown');
    setup();

    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  });

  test('initializes with first tab when path is empty', () => {
    mockLocationUtils.getPathname.mockReturnValue('/patient/123');
    setup();

    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  });

  test('navigates when tab is clicked', async () => {
    setup();

    const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
    await act(async () => {
      fireEvent.click(timelineTab);
    });

    expect(navigateMock).toHaveBeenCalledWith('/patient/123/timeline');
  });

  test('matches tab whose value contains a query string against the pathname segment', async () => {
    mockLocationUtils.getPathname.mockReturnValue('/Patient/abc/Encounter');
    const tabs = [
      { label: 'Timeline', value: 'timeline' },
      { label: 'Visits', value: 'Encounter?_count=20&patient=abc' },
      { label: 'Tasks', value: 'Task' },
    ];
    setup({ baseUrl: '/Patient/abc', tabs });

    const visitsTab = screen.getByRole('tab', { name: 'Visits' });
    expect(visitsTab).toHaveAttribute('aria-selected', 'true');

    await act(async () => {
      fireEvent.click(visitsTab);
    });
    // Navigation must preserve the original case and full query string
    expect(navigateMock).toHaveBeenCalledWith('/Patient/abc/Encounter?_count=20&patient=abc');
  });

  test('allows middle click', async () => {
    console.error = vi.fn(); // Suppress warning for "navigation not implemented" warning

    setup();

    const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
    const anchor = timelineTab.querySelector('a') as HTMLAnchorElement;

    await act(async () => {
      // Left click should be prevented, therefore fireEvent.click returns false
      expect(fireEvent.click(anchor, { button: 0 })).toBe(false);
    });

    await act(async () => {
      // Middle click should be allowed, therefore fireEvent.click returns true
      expect(fireEvent.click(anchor, { button: 1 })).toBe(true);
    });
  });
});
