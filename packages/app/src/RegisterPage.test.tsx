// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import crypto from 'crypto';
import { MemoryRouter } from 'react-router';
import { TextEncoder } from 'util';
import { AppRoutes } from './AppRoutes';
import { getConfig } from './config';
import { act, render, screen, userEvent, UserEvent } from './test-utils/render';

async function setup(medplum: MedplumClient): Promise<UserEvent> {
  const user = userEvent.setup();
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/register']} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <AppRoutes />
        </MedplumProvider>
      </MemoryRouter>
    );
  });

  return user;
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

  beforeEach(() => {
    getConfig().registerEnabled = true;
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
    const user = await setup(medplum);

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

    await user.type(screen.getByLabelText('First name *'), 'George');
    await user.type(screen.getByLabelText('Last name *'), 'Washington');
    await user.type(screen.getByLabelText('Email *'), 'george@example.com');
    await user.type(screen.getByLabelText('Password *'), 'password');

    await user.click(screen.getByRole('button'));

    await user.type(screen.getByLabelText('Project Name *'), 'Test Project');

    await user.click(screen.getByRole('button'));
  });

  test('Register disabled', async () => {
    getConfig().registerEnabled = false;

    const medplum = new MockClient();
    medplum.getProfile = jest.fn(() => undefined) as any;
    medplum.startNewUser = jest.fn(() => Promise.resolve({ login: '1' }));
    await setup(medplum);

    expect(screen.getByText('New projects are disabled on this server.')).toBeInTheDocument();
  });
});
