// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { render, screen, userEvent, waitFor } from '../test-utils/render';
import type { ChangePasswordFormProps } from './ChangePasswordForm';
import { ChangePasswordForm } from './ChangePasswordForm';

function mockFetch(url: string, options: any): Promise<any> {
  let status = 404;
  let result: any = {};

  if (options.method === 'POST' && url.endsWith('/auth/changepassword')) {
    const body = JSON.parse(options.body);
    if (body.oldPassword === 'orange') {
      status = 200;
      result = {};
    } else {
      status = 400;
      result = {
        resourceType: 'OperationOutcome',
        issue: [
          { severity: 'error', code: 'invalid', expression: ['oldPassword'], details: { text: 'Incorrect password' } },
        ],
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

function setup(props: ChangePasswordFormProps = {}): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup();
  render(
    <MedplumProvider medplum={medplum}>
      <ChangePasswordForm {...props} />
    </MedplumProvider>
  );
  return user;
}

describe('ChangePasswordForm', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', { value: TextEncoder });
    Object.defineProperty(global, 'crypto', { value: webcrypto });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Renders form', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Old password *')).toBeInTheDocument();
    expect(screen.getByLabelText('New password *')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  test('Submit success', async () => {
    const onSuccess = jest.fn();
    const user = setup({ onSuccess });

    await user.type(screen.getByLabelText('Old password *'), 'orange');
    await user.type(screen.getByLabelText('New password *'), 'purple');
    await user.type(screen.getByLabelText('Confirm new password *'), 'purple');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(screen.getByTestId('success')).toBeInTheDocument());
    expect(onSuccess).toHaveBeenCalled();
  });

  test('Wrong old password', async () => {
    const user = setup();

    await user.type(screen.getByLabelText('Old password *'), 'watermelon');
    await user.type(screen.getByLabelText('New password *'), 'purple');
    await user.type(screen.getByLabelText('Confirm new password *'), 'purple');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(screen.getByText('Incorrect password')).toBeInTheDocument());
  });
});
