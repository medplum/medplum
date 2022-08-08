import { MedplumClient } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import crypto from 'crypto';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TextEncoder } from 'util';
import { RegisterPage } from './RegisterPage';
import { SignInPage } from './SignInPage';

async function setup(medplum: MedplumClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/register']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <Routes>
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Routes>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('RegisterPage', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global, 'crypto', {
      value: crypto.webcrypto,
    });
  });

  test('Renders', async () => {
    const medplum = new MockClient();
    medplum.getProfile = jest.fn(() => undefined) as any;
    await setup(medplum);
    const input = screen.getByTestId('submit') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Create account');
  });

  test('Redirect if signed in', async () => {
    const medplum = new MockClient();
    await setup(medplum);
    expect(screen.getByText('Sign in to Medplum')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    const medplum = new MockClient();
    medplum.getProfile = jest.fn(() => undefined) as any;
    await setup(medplum);

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

    await act(async () => {
      fireEvent.change(screen.getByTestId('firstName'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByTestId('lastName'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByTestId('projectName'), {
        target: { value: 'Test Project' },
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
  });
});
