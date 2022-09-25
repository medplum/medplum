import { MedplumClient } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import crypto from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TextEncoder } from 'util';
import { AppRoutes } from './AppRoutes';

async function setup(medplum: MedplumClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/register']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <AppRoutes />
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
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  test('Redirect if signed in', async () => {
    const medplum = new MockClient();
    await setup(medplum);
    expect(screen.getByText('Sign in to Medplum')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    const medplum = new MockClient();
    medplum.getProfile = jest.fn(() => undefined) as any;
    medplum.startNewUser = jest.fn(() => Promise.resolve({ login: '1' }));
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
      fireEvent.change(screen.getByLabelText('First name *'), {
        target: { value: 'George' },
      });
      fireEvent.change(screen.getByLabelText('Last name *'), {
        target: { value: 'Washington' },
      });
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'george@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Password *'), {
        target: { value: 'password' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    fireEvent.change(screen.getByLabelText('Project Name *'), {
      target: { value: 'Test Project' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
  });
});
