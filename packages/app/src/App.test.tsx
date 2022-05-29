import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const medplum = new MockClient();

async function setup(): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <App />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('App', () => {
  test('Renders', async () => {
    await setup();
    await waitFor(() => screen.getByTestId('search-control'));

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
  });

  test('Click logo', async () => {
    await setup();
    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-logo'));
    });
  });

  test('Click profile', async () => {
    await setup();
    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-link'));
    });
  });

  test('Click sign out', async () => {
    await setup();
    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-signout-button'));
    });
  });
});
