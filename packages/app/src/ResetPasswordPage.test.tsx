import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ResetPasswordPage } from './ResetPasswordPage';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  let status = 404;
  let result: any;

  if (options.method === 'POST' && url.endsWith('/auth/login')) {
    const { email, password } = JSON.parse(options.body);
    if (email === 'admin@medplum.com' && password === 'admin') {
      status = 301;
      result = {};
    } else if (email !== 'admin@medplum.com') {
      result = {
        resourceType: 'OperationOutcome',
        issue: [{
          expression: ['email'],
          details: {
            text: 'User not found'
          }
        }]
      };
    } else {
      result = {
        resourceType: 'OperationOutcome',
        issue: [{
          expression: ['password'],
          details: {
            text: 'Incorrect password'
          }
        }]
      };
    }
  }

  const response: any = {
    request: {
      url,
      options
    },
    status,
    ...result
  };

  return Promise.resolve({
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

const setup = () => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <ResetPasswordPage />
    </MedplumProvider>
  );
};

describe('ResetPasswordPage', () => {

  test('Renders', () => {
    const utils = setup();
    const input = utils.getByTestId('submit') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Reset password');
  });

  test('Submit success', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByTestId('email'), { target: { value: 'admin@medplum.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

});
