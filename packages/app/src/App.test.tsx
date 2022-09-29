import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const medplum = new MockClient();

async function setup(): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider withGlobalStyles withNormalizeCSS>
            <App />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('App', () => {
  test('Click logo', async () => {
    await setup();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Medplum Logo'));
    });

    expect(screen.getByText('Patients')).toBeInTheDocument();
  });

  test('Click profile', async () => {
    await setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alice Smith Alice Smith' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Account settings'));
    });
  });

  test('Change profile', async () => {
    await setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alice Smith Alice Smith' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add another account'));
    });
  });

  test('Click sign out', async () => {
    await setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alice Smith Alice Smith' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign out'));
    });
  });
});
