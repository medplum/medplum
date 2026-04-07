// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { ResetPasswordFormProps } from './ResetPasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';

function mockFetch(url: string, options: any): Promise<any> {
  let status = 404;
  let result: any = {};

  if (options.method === 'POST' && url.endsWith('/auth/resetpassword')) {
    status = 200;
    result = {};
  }

  return Promise.resolve({
    status,
    ok: status < 400,
    headers: { get: () => 'application/fhir+json' },
    json: () => Promise.resolve(result),
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  fetch: mockFetch,
});

async function setup(props: ResetPasswordFormProps): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <ResetPasswordForm {...props} />
      </MedplumProvider>
    );
  });
}

describe('ResetPasswordForm', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global, 'crypto', {
      value: webcrypto,
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Renders form', async () => {
    await setup({});
    expect(screen.getByText('Reset your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeInTheDocument();
  });

  test('Submit success', async () => {
    const onSuccess = jest.fn();
    await setup({ onSuccess });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'user@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
    });

    expect(await screen.findByText(/password reset email will be sent/i)).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });

  test('Shows sign in link when onSignIn provided', async () => {
    const onSignIn = jest.fn();
    await setup({ onSignIn });

    expect(screen.getByText('Back to Sign In')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Back to Sign In'));
    });

    expect(onSignIn).toHaveBeenCalled();
  });

  test('Shows register link when onRegister provided', async () => {
    const onRegister = jest.fn();
    await setup({ onRegister });

    expect(screen.getByText('Sign Up')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Sign Up'));
    });

    expect(onRegister).toHaveBeenCalled();
  });

  test('Does not show navigation links when callbacks not provided', async () => {
    await setup({});

    expect(screen.queryByText('Back to Sign In')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign Up')).not.toBeInTheDocument();
  });
});
