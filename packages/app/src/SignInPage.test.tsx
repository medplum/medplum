import { Practitioner } from '@medplum/fhirtypes';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SignInPage } from './SignInPage';

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

const medplum = new MockClient({
  'fhir/R4/Practitioner/123': {
    'GET': practitioner
  }
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
