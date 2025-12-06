// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Tabs } from '@mantine/core';
import { locationUtils } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { LinkTabs } from './LinkTabs';

const medplum = new MockClient();
const navigateMock = jest.fn();

// Mock locationUtils
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
          <LinkTabs {...defaultProps} {...props}>
            <Tabs.List>
              <Tabs.Tab value="overview">Overview</Tabs.Tab>
              <Tabs.Tab value="timeline">Timeline</Tabs.Tab>
              <Tabs.Tab value="details">Details</Tabs.Tab>
            </Tabs.List>
          </LinkTabs>
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

  test('navigates to first tab when null value is passed to onChange', async () => {
    setup();
    
    const tabsComponent = screen.getByRole('tablist');
    await act(async () => {
      fireEvent(tabsComponent, new CustomEvent('change', { detail: null }));
    });
    
    expect(navigateMock).toHaveBeenCalledWith('/patient/123/overview');
  });

  test('opens new window on auxiliary click (middle click)', async () => {
    const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    setup();
    
    const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
    await act(async () => {
      fireEvent.auxClick(timelineTab, { button: 1 });
    });
    
    expect(windowOpenSpy).toHaveBeenCalledWith('/patient/123/timeline', '_blank');
  });

  test('stops propagation on auxiliary click', async () => {
    setup();
    
    const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
    const mockStopPropagation = jest.fn();
    
    await act(async () => {
      fireEvent.auxClick(timelineTab, { 
        stopPropagation: mockStopPropagation,
        target: { innerText: 'Timeline' }
      });
    });
    
    expect(mockStopPropagation).toHaveBeenCalled();
  });

  test('handles case-insensitive tab matching', () => {
    mockLocationUtils.getPathname.mockReturnValue('/patient/123/TIMELINE');
    setup();
    
    const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
    expect(timelineTab).toHaveAttribute('aria-selected', 'true');
  });

  test('passes through additional props to Mantine Tabs', () => {
    setup({ 
      orientation: 'vertical',
      'data-testid': 'custom-tabs'
    });
    
    const tabsComponent = screen.getByTestId('custom-tabs');
    expect(tabsComponent).toBeInTheDocument();
  });

  test('handles tab change with valid tab name', async () => {
    setup();
    
    const detailsTab = screen.getByRole('tab', { name: 'Details' });
    await act(async () => {
      fireEvent.click(detailsTab);
    });
    
    expect(navigateMock).toHaveBeenCalledWith('/patient/123/details');
  });

  test('renders children correctly', () => {
    setup();
    
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  test('handles empty tabs array gracefully', () => {
    const propsWithNoTabs = { ...defaultProps, tabs: [] };
    setup(propsWithNoTabs);
    
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  test('auxiliary click with complex target structure', async () => {
    const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    setup();
    
    const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
    const mockEvent = {
      stopPropagation: jest.fn(),
      target: {
        innerText: 'Timeline'
      }
    };
    
    await act(async () => {
      fireEvent.auxClick(timelineTab, mockEvent);
    });
    
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(windowOpenSpy).toHaveBeenCalledWith('/patient/123/timeline', '_blank');
  });
});