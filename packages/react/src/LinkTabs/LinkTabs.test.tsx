// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { locationUtils } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { LinkTabs } from './LinkTabs';

const medplum = new MockClient();
const navigateMock = jest.fn();

jest.mock('@medplum/core', () => ({
  ...jest.requireActual('@medplum/core'),
  locationUtils: {
    getPathname: jest.fn(),
  },
}));

const mockLocationUtils = locationUtils as jest.Mocked<typeof locationUtils>;

describe('LinkTabs', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mockLocationUtils.getPathname.mockReturnValue('/patient/123/overview');
    jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('allows middle click', async () => {
    console.error = jest.fn(); // Suppress warning for "navigation not implemented" warning

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
