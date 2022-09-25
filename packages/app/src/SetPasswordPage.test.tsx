import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';

const medplum = new MockClient();

function setup(url: string): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <AppRoutes />
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('SetPasswordPage', () => {
  test('Renders', () => {
    setup('/setpassword/123/456');
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument();
  });

  test('Submit success', async () => {
    setup('/setpassword/123/456');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'orange' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Passwords do not match', async () => {
    setup('/setpassword/123/456');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'watermelon' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  test('Invalid new password', async () => {
    setup('/setpassword/123/456');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('New password *'), {
        target: { value: 'watermelon' },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password *'), {
        target: { value: 'watermelon' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByText('Invalid password')).toBeInTheDocument();
  });
});
