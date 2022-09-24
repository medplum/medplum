import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SignInPage } from './SignInPage';

const medplum = new MockClient();

describe('SignInPage', () => {
  function setup(): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <SignInPage />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders', async () => {
    setup();

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('Success', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });
  });

  test('Forgot password', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Forgot password'));
    });
  });

  test('Register', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Register'));
    });
  });
});
