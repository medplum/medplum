import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { act, fireEvent, render, screen } from './test-utils/render';

const navigateMock = jest.fn();

async function setup(url = '/'): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <MedplumProvider medplum={new MockClient()} navigate={navigateMock}>
          <MantineProvider>
            <App />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('App', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Click logo', async () => {
    await setup();
    await openNav();

    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  test('Click profile', async () => {
    await setup();
    await openMenu();

    await act(async () => {
      fireEvent.click(screen.getByText('Account settings'));
    });
  });

  test('Change profile', async () => {
    await setup();
    await openMenu();

    await act(async () => {
      fireEvent.click(screen.getByText('Add another account'));
    });
  });

  test('Click sign out', async () => {
    await setup();
    await openMenu();

    await act(async () => {
      fireEvent.click(screen.getByText('Sign out'));
    });
  });

  test('Active link', async () => {
    await setup('/ServiceRequest?status=active');
    await openNav();

    const activeLink = screen.getByText('Active Orders');
    const completedLink = screen.getByText('Completed Orders');
    expect(activeLink.parentElement?.className).not.toEqual(completedLink.parentElement?.className);
  });

  test('Resource Type Search', async () => {
    await setup();
    await openNav();

    const input = (await screen.findByPlaceholderText('Resource Type')) as HTMLInputElement;

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

function isNavOpen(): boolean {
  return !!screen.queryByRole('navigation');
}

async function openNav(): Promise<void> {
  if (!isNavOpen()) {
    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });
  }
}

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
