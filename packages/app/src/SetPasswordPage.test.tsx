import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SetPasswordPage } from './SetPasswordPage';

const medplum = new MockClient();

function setup(url: string): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <Routes>
          <Route path="/setpassword/:id/:secret" element={<SetPasswordPage />} />
        </Routes>
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('SetPasswordPage', () => {
  test('Renders', () => {
    setup('/setpassword/123/456');
    const input = screen.getByRole('button') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Set password');
  });

  test('Submit success', async () => {
    setup('/setpassword/123/456');

    await act(async () => {
      fireEvent.change(screen.getByTestId('password'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByTestId('confirmPassword'), {
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
      fireEvent.change(screen.getByTestId('password'), {
        target: { value: 'orange' },
      });
      fireEvent.change(screen.getByTestId('confirmPassword'), {
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
      fireEvent.change(screen.getByTestId('password'), {
        target: { value: 'watermelon' },
      });
      fireEvent.change(screen.getByTestId('confirmPassword'), {
        target: { value: 'watermelon' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByText('Invalid password')).toBeInTheDocument();
  });
});
