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
  const origEnv = process.env;
  const grecaptchaResolved = jest.fn();

  beforeAll(() => {
    Object.defineProperty(global, 'grecaptcha', {
      value: {
        ready(callback: () => void): void {
          callback();
        },
        execute(): Promise<string> {
          grecaptchaResolved();
          return Promise.resolve('token');
        },
      },
    });
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
    jest.clearAllMocks();
  });

  test('Renders', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
  });

  test('Submit success with recaptcha site key', async () => {
    process.env.RECAPTCHA_SITE_KEY = 'recaptchasitekey';
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    });
    expect(grecaptchaResolved).toHaveBeenCalled();
    expect(screen.getByText('Email sent')).toBeInTheDocument();
  });

  test('Submit success without recaptcha site key', async () => {
    process.env.RECAPTCHA_SITE_KEY = '';
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    });
    expect(grecaptchaResolved).not.toBeCalled();
    expect(screen.getByText('Email sent')).toBeInTheDocument();
  });
});
