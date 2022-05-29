import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';

const medplum = new MockClient();

function setup(): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <ResetPasswordPage />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('ResetPasswordPage', () => {
  beforeAll(() => {
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

  test('Renders', () => {
    setup();
    const input = screen.getByTestId('submit') as HTMLButtonElement;
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
