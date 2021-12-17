import { allOk } from '@medplum/core';
import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';

const medplum = new MockClient({
  'auth/resetpassword': {
    POST: (body: string) => {
      const { email } = JSON.parse(body);
      if (email === 'admin@example.com') {
        return allOk;
      } else {
        return undefined;
      }
    },
  },
});

const setup = () => {
  return render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <ResetPasswordPage />
      </MedplumProvider>
    </MemoryRouter>
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
      fireEvent.change(screen.getByTestId('email'), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });
});
