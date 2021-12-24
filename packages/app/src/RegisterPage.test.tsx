import { allOk } from '@medplum/core';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import crypto from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TextEncoder } from 'util';
import { RegisterPage } from './RegisterPage';

const medplum = new MockClient({
  'auth/register': {
    POST: (body: string) => {
      const { email, password } = JSON.parse(body);
      if (email === 'george@example.com' && password === 'password') {
        return allOk;
      } else {
        return undefined;
      }
    },
  },
});

const setup = () => {
  return render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <RegisterPage />
      </MedplumProvider>
    </MemoryRouter>
  );
};

describe('RegisterPage', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global, 'crypto', {
      value: crypto.webcrypto,
    });

    Object.defineProperty(global, 'grecaptcha', {
      value: {
        ready(callback: () => void): void {
          callback();
        },
        execute(): Promise<string> {
          return Promise.resolve('token');
        },
      },
    });
  });

  test('Renders', () => {
    const utils = setup();
    const input = utils.getByTestId('submit') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Create account');
  });

  test('Submit success', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByTestId('firstName'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByTestId('lastName'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByTestId('email'), {
        target: { value: 'george@example.com' },
      });
      fireEvent.change(screen.getByTestId('password'), {
        target: { value: 'password' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(async () => expect(screen.getByTestId('success')).toBeInTheDocument());

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });
});
