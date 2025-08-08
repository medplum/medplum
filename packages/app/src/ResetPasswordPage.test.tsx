// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { ResetPasswordPage } from './ResetPasswordPage';
import { getConfig } from './config';
import { render, screen, userEvent, UserEvent } from './test-utils/render';

const medplum = new MockClient();

function setup(): UserEvent {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <ResetPasswordPage />
      </MedplumProvider>
    </MemoryRouter>
  );

  return user;
}

describe('ResetPasswordPage', () => {
  const grecaptchaResolved = jest.fn();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'grecaptcha', {
      value: {
        ready(callback: () => void): void {
          callback();
        },
        execute(): Promise<string> {
          grecaptchaResolved();
          return Promise.resolve('token');
        },
      },
    });
  });

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Renders', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
  });

  test('Submit success with recaptcha site key', async () => {
    getConfig().recaptchaSiteKey = 'recaptchasitekey';
    const user = setup();

    await user.type(screen.getByLabelText('Email *'), 'admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(grecaptchaResolved).toHaveBeenCalled();
    expect(screen.getByText('password reset email will be sent', { exact: false })).toBeInTheDocument();
  });

  test('Submit success without recaptcha site key', async () => {
    getConfig().recaptchaSiteKey = '';
    const user = setup();

    await user.type(screen.getByLabelText('Email *'), 'admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(grecaptchaResolved).not.toHaveBeenCalled();
    expect(screen.getByText('password reset email will be sent', { exact: false })).toBeInTheDocument();
  });
});
