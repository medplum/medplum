// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { SetPasswordFormProps } from './SetPasswordForm';
import { SetPasswordForm } from './SetPasswordForm';

function mockFetch(url: string, options: any): Promise<any> {
  let status = 404;
  let result: any = {};

  if (options.method === 'POST' && url.endsWith('/auth/setpassword')) {
    const body = JSON.parse(options.body);
    if (body.password === 'orange') {
      status = 200;
      result = {};
    } else {
      status = 400;
      result = {
        resourceType: 'OperationOutcome',
        issue: [{ details: { text: 'Invalid password' } }],
      };
    }
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

async function setup(props: SetPasswordFormProps): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <SetPasswordForm {...props} />
      </MedplumProvider>
    );
  });
}

describe('SetPasswordForm', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', { value: TextEncoder });
    Object.defineProperty(global, 'crypto', { value: webcrypto });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Renders form', async () => {
    await setup({ id: '123', secret: '456' });
    expect(screen.getByRole('heading', { name: 'Set password' })).toBeInTheDocument();
    expect(screen.getByLabelText('New password *')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument();
  });

  test('Submit success', async () => {
    const onSuccess = jest.fn();
    await setup({ id: '123', secret: '456', onSuccess });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'orange' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    });

    expect(await screen.findByTestId('success')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });

  test('Passwords do not match', async () => {
    await setup({ id: '123', secret: '456' });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'watermelon' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    });

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  test('Invalid password error from server', async () => {
    jest.useFakeTimers();
    await setup({ id: '123', secret: '456' });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'watermelon' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'watermelon' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    });

    await act(async () => {
      await jest.runAllTimersAsync();
    });

    expect(screen.getByText('Invalid password')).toBeInTheDocument();
    jest.useRealTimers();
  });

  test('Shows sign in link when onSignIn provided', async () => {
    const onSignIn = jest.fn();
    await setup({ id: '123', secret: '456', onSignIn });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'orange' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    });

    expect(await screen.findByTestId('success')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('sign in'));
    });

    expect(onSignIn).toHaveBeenCalled();
  });
});
