// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { App } from './App';
import { act, render, screen, userEvent, UserEvent } from './test-utils/render';

const navigateMock = jest.fn();

async function setup(url = '/'): Promise<UserEvent> {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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

  return user;
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
    const user = await setup();
    await openNav(user);

    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  test('Click profile', async () => {
    const user = await setup();
    await openMenu(user);

    await user.click(screen.getByText('Account settings'));
  });

  test('Change profile', async () => {
    const user = await setup();
    await openMenu(user);

    await user.click(screen.getByText('Add another account'));
  });

  test('Click sign out', async () => {
    const user = await setup();
    await openMenu(user);

    await user.click(screen.getByText('Sign out'));
  });

  test('Active link', async () => {
    const user = await setup('/ServiceRequest?status=active');
    await openNav(user);

    const activeLink = screen.getByText('Active Orders');
    const completedLink = screen.getByText('Completed Orders');
    expect(activeLink.parentElement?.className).not.toEqual(completedLink.parentElement?.className);
  });

  test('Resource Type Search', async () => {
    const user = await setup();
    await openNav(user);

    const input = (await screen.findByPlaceholderText('Resource Type')) as HTMLInputElement;

    // Enter random text
    await user.type(input, 'Different');

    await user.type(input, 'Test');

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await user.keyboard('{ArrowDown}');

    // Press "Enter"
    await user.keyboard('{Enter}');

    expect(navigateMock).toHaveBeenCalledWith('/test-code');
  });
});

function isNavOpen(): boolean {
  return !!screen.queryByRole('navigation');
}

async function openNav(user: UserEvent): Promise<void> {
  if (!isNavOpen()) {
    await user.click(screen.getByTitle('Medplum Logo'));
  }
}

function isMenuOpen(): boolean {
  return !!screen.queryByText('Sign out');
}

async function openMenu(user: UserEvent): Promise<void> {
  if (!isMenuOpen()) {
    await user.click(screen.getByRole('button', { name: 'Alice Smith Alice Smith' }));

    await screen.findByText('Sign out');
  }
}
