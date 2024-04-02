import { AppShell as MantineAppShell } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { Logo } from '../Logo/Logo';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Header } from './Header';

const medplum = new MockClient();
const navigateMock = jest.fn();
const closeMock = jest.fn();

async function setup(initialUrl = '/'): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[initialUrl]} initialIndex={0}>
        <MedplumProvider medplum={medplum} navigate={navigateMock}>
          <MantineAppShell>
            <Header logo={<Logo size={24} />} version="test.version" navbarToggle={closeMock} />
          </MantineAppShell>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('Header', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigateMock.mockClear();
    closeMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  test('Open and close the user menu', async () => {
    await setup();

    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();

    const menuButton = screen.getByText('Alice Smith');

    await act(async () => {
      fireEvent.click(menuButton);
    });

    expect(await screen.findByText('Sign out')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(menuButton);
    });
  });

  test('Switch profile', async () => {
    const reloadMock = jest.fn();

    Object.defineProperty(window, 'location', {
      value: {
        reload: reloadMock,
      },
    });

    window.localStorage.setItem(
      'activeLogin',
      JSON.stringify({
        accessToken: 'abc',
        refreshToken: 'xyz',
        profile: {
          reference: 'Practitioner/123',
          display: 'Alice Smith',
        },
        project: {
          reference: 'Project/456',
          display: 'My Project',
        },
      })
    );
    window.localStorage.setItem(
      'logins',
      JSON.stringify([
        {
          accessToken: 'abc',
          refreshToken: 'xyz',
          profile: {
            reference: 'Practitioner/123',
            display: 'Alice Smith',
          },
          project: {
            reference: 'Project/456',
            display: 'My Project',
          },
        },
        {
          accessToken: 'def',
          refreshToken: '123',
          profile: {
            reference: 'Practitioner/789',
            display: 'Alice Smith',
          },
          project: {
            reference: 'Project/789',
            display: 'My Other Project',
          },
        },
      ])
    );

    await setup();

    // Click on the profile name to open the menu
    await act(async () => {
      fireEvent.click(screen.getByText('Alice Smith'));
    });

    expect(await screen.findByText('My Project')).toBeInTheDocument();
    expect(await screen.findByText('My Other Project')).toBeInTheDocument();

    // Click on other project to switch
    await act(async () => {
      fireEvent.click(screen.getByText('My Other Project'));
    });

    expect(window.location.reload).toHaveBeenCalled();
  });

  test('Add another account', async () => {
    await setup();
    await openMenu();

    expect(screen.getByText('Add another account')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Add another account'));
    });

    expect(navigateMock).toHaveBeenCalledWith('/signin');
  });

  test('Account settings', async () => {
    await setup();
    await openMenu();

    expect(screen.getByText('Account settings')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Account settings'));
    });

    expect(navigateMock).toHaveBeenCalledWith('/Practitioner/123');
  });

  test('Sign out', async () => {
    await setup();
    await openMenu();

    expect(screen.getByText('Sign out')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Sign out'));
    });

    expect(navigateMock).toHaveBeenCalledWith('/signin');
  });

  test('Dark mode', async () => {
    await setup();
    await openMenu();

    // Click "Dark"
    const darkButton = await screen.findByLabelText('Dark');
    await act(async () => {
      fireEvent.click(darkButton);
    });

    // Get the root <html> element
    const html = document.querySelector('html');
    expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
  });
});

function isMenuOpen(): boolean {
  return !!screen.queryByText('Sign out');
}

async function openMenu(): Promise<void> {
  if (!isMenuOpen()) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alice Smith Alice Smith' }));
    });

    await screen.findByText('Sign out');
  }
}
