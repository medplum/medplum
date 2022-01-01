import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ChangePasswordPage } from './ChangePasswordPage';

const medplum = new MockClient();

function setup(): void {
  render(
    <MedplumProvider medplum={medplum}>
      <ChangePasswordPage />
    </MedplumProvider>
  );
}

describe('ChangePasswordPage', () => {
  test('Renders', () => {
    setup();
    const input = screen.getByTestId('submit') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Change password');
  });

  test('Submit success', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByTestId('oldPassword'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByTestId('newPassword'), {
        target: { value: 'purple' },
      });
      fireEvent.change(screen.getByTestId('confirmPassword'), {
        target: { value: 'purple' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Wrong old password', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByTestId('oldPassword'), {
        target: { value: 'watermelon' },
      });
      fireEvent.change(screen.getByTestId('newPassword'), {
        target: { value: 'purple' },
      });
      fireEvent.change(screen.getByTestId('confirmPassword'), {
        target: { value: 'purple' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    expect(screen.getByText('Incorrect password')).toBeInTheDocument();
  });
});
