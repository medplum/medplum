import { MedplumClient, Practitioner, User } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SignInPage } from './SignInPage';

const user: User = {
  resourceType: 'User',
  id: '123'
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }],
  meta: {
    versionId: '456',
    lastUpdated: '2021-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123'
    }
  }
};

function mockFetch(url: string, options: any): Promise<any> {
  const method = options.method ?? 'GET';
  let result: any;

  if (method === 'POST' && url.endsWith('/auth/login')) {
    result = {
      user,
      profile: 'Practitioner/123'
    };
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123')) {
    result = practitioner;
  }

  const response: any = {
    request: {
      url,
      options
    },
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

describe('SignInPage', () => {

  const setup = () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <SignInPage />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders', async () => {
    setup();

    const input = screen.getByTestId('submit') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Sign in');
  });

  test('Success', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
  });

  test('Forgot password', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByTestId('forgotpassword'));
    });
  });

  test('Register', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByTestId('register'));
    });
  });

});
