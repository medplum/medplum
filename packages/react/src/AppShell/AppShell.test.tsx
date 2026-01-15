// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { Logo } from '../Logo/Logo';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AppShell } from './AppShell';

const medplum = new MockClient();
const navigateMock = jest.fn();

async function setup(layoutVersion: 'v1' | 'v2' = 'v1'): Promise<void> {
  // Reset localStorage before each test
  localStorage.clear();

  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum} navigate={navigateMock}>
          <AppShell
            logo={<Logo size={24} />}
            version="test.version"
            layoutVersion={layoutVersion}
            menus={[
              {
                title: 'Menu 1',
                links: [
                  { label: 'Link 1', href: '/link1' },
                  { label: 'Link 2', href: '/link2' },
                  { label: 'Link 3', href: '/link3' },
                ],
              },
              {
                title: 'Menu 2',
                links: [
                  { label: 'Link 4', href: '/link4' },
                  { label: 'Link 5', href: '/link5' },
                  { label: 'Link 6', href: '/link6' },
                ],
              },
            ]}
          >
            Your application here
          </AppShell>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('AppShell v1', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigateMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup();

    expect(screen.getByText('Your application here')).toBeInTheDocument();
  });

  test('Toggle sidebar', async () => {
    await setup();
    expect(screen.getByText('Your application here')).toBeInTheDocument();
    expect(screen.queryByText('Menu 1')).not.toBeInTheDocument();

    // Click on the logo to open the menu
    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    expect(screen.getByText('Menu 1')).toBeInTheDocument();

    // Click on the logo to close the menu
    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    expect(screen.queryByText('Menu 1')).not.toBeInTheDocument();
  });

  test('Resource Type Search', async () => {
    await setup();

    // Click on the logo to open the menu
    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    const input = screen.getByPlaceholderText('Resource Type');

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Different' } });
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(navigateMock).toHaveBeenCalledWith('/test-code');
  });
});

describe('AppShell v2', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigateMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders v2', async () => {
    await setup('v2');

    expect(screen.getByText('Your application here')).toBeInTheDocument();
  });

  test('Toggle sidebar v2 via logo', async () => {
    await setup('v2');
    expect(screen.getByText('Your application here')).toBeInTheDocument();

    const logoButton = screen.getByRole('button', { name: 'Medplum Logo' });
    const menuTitle = screen.getByText('Menu 1');

    expect(logoButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuTitle.dataset.opened).toBeNull();

    // Click on the logo to open the menu
    await act(async () => {
      fireEvent.click(logoButton);
    });

    expect(logoButton).toHaveAttribute('aria-expanded', 'true');
    expect(menuTitle.dataset.opened).toBe('true');

    // Click on the logo to close the menu
    await act(async () => {
      fireEvent.click(logoButton);
    });

    expect(logoButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuTitle.dataset.opened).toBeNull();
  });

  test('Toggle sidebar v2 via toggle button', async () => {
    await setup('v2');
    expect(screen.getByText('Your application here')).toBeInTheDocument();

    const toggleButton = screen.getByLabelText('Open Sidebar');
    const menuTitle = screen.getByText('Menu 1');

    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuTitle.dataset.opened).toBeNull();

    // Click on the toggle button to open the menu
    await act(async () => {
      fireEvent.click(toggleButton);
    });

    expect(screen.getByLabelText('Close Sidebar')).toHaveAttribute('aria-expanded', 'true');
    expect(menuTitle.dataset.opened).toBe('true');

    // Click again to close the menu
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close Sidebar'));
    });

    expect(screen.getByLabelText('Open Sidebar')).toHaveAttribute('aria-expanded', 'false');
    expect(menuTitle.dataset.opened).toBeNull();
  });

  test('Spotlight search', async () => {
    await setup('v2');

    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    const searchButton = screen.getByText('Search');

    await act(async () => {
      fireEvent.click(searchButton);
    });

    const input = await screen.findByPlaceholderText(/Start typing to search/i);

    // Expect the initial keyboard shortcut hint when nothing is in recent history
    expect(screen.getByText(/open Search next time/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'jibberish' } });
    });

    // Expect the "No results found" message:
    expect(await screen.findByText('No results found')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
    });

    // Back to the initial keyboard shortcut hint:
    expect(await screen.findByText(/open Search next time/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Homer' } });
    });

    // Find the Homer Simpson option
    // Note that the Spotlight control uses extra HTML markup to highlight the search term,
    // so instead we cheat and find the element by partial text match on birth date.
    const homerOption = await screen.findByText('1956-05-12', { exact: false });
    expect(homerOption).toBeInTheDocument();

    // Click on Homer
    await act(async () => {
      fireEvent.click(homerOption);
    });

    expect(navigateMock).toHaveBeenCalledWith('/Patient/123');
  });
});
