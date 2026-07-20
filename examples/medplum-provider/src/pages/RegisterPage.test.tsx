// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import type { UserEvent } from '../test-utils/render';
import { act, render, screen, userEvent } from '../test-utils/render';

async function setup(medplum: MedplumClient, url = '/register'): Promise<UserEvent> {
  const user = userEvent.setup();
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <App />
        </MedplumProvider>
      </MemoryRouter>
    );
  });

  return user;
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.stubEnv('MEDPLUM_REGISTER_ENABLED', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('Renders', async () => {
    vi.stubEnv('MEDPLUM_REGISTER_ENABLED', 'true');

    const medplum = new MockClient({ profile: null });
    await setup(medplum);

    expect(screen.getByText('Register a new Provider account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register Account' })).toBeInTheDocument();
  });

  test('Redirects to sign in if signed in', async () => {
    vi.stubEnv('MEDPLUM_REGISTER_ENABLED', 'true');

    const medplum = new MockClient({ profile: DrAliceSmith });
    await setup(medplum);

    expect(screen.getByText('Sign in to Provider')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    vi.stubEnv('MEDPLUM_REGISTER_ENABLED', 'true');

    const medplum = new MockClient({ profile: null });
    medplum.startNewUser = vi.fn(() => Promise.resolve({ login: '1' }));
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
      configurable: true,
    });

    await user.type(screen.getByLabelText('First name *'), 'George');
    await user.type(screen.getByLabelText('Last name *'), 'Washington');
    await user.type(screen.getByLabelText('Email *'), 'george@example.com');
    await user.type(screen.getByLabelText('Password *'), 'password');

    await user.click(screen.getByRole('button', { name: 'Register Account' }));

    expect(await screen.findByLabelText('Project Name *')).toBeInTheDocument();
  });

  test('Register disabled by default', async () => {
    const medplum = new MockClient({ profile: null });
    await setup(medplum);

    expect(screen.getByText('New projects are disabled on this server.')).toBeInTheDocument();
  });

  test('Register disabled when explicitly false', async () => {
    vi.stubEnv('MEDPLUM_REGISTER_ENABLED', 'false');

    const medplum = new MockClient({ profile: null });
    await setup(medplum);

    expect(screen.getByText('New projects are disabled on this server.')).toBeInTheDocument();
  });
});
