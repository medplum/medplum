import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SignInPage } from './SignInPage';

const medplum = new MockClient();

describe('SignInPage', () => {
  const setup = () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <SignInPage />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders', async () => {
    setup();

    const input = screen.getByTestId('submit') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Sign in');
  });

  test('Success', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
  });

  test('Forgot password', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByTestId('forgotpassword'));
    });
  });

  test('Register', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByTestId('register'));
    });
  });
});
