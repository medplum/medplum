import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';
import { getConfig } from './config';
import { act, fireEvent, render, screen } from './test-utils/render';

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
  const grecaptchaResolved = jest.fn();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'grecaptcha', {
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Renders', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
  });

  test('Submit success with recaptcha site key', async () => {
    getConfig().recaptchaSiteKey = 'recaptchasitekey';
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
    expect(screen.getByText('password reset email will be sent', { exact: false })).toBeInTheDocument();
  });

  test('Submit success without recaptcha site key', async () => {
    getConfig().recaptchaSiteKey = '';
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    });
    expect(grecaptchaResolved).not.toHaveBeenCalled();
    expect(screen.getByText('password reset email will be sent', { exact: false })).toBeInTheDocument();
  });
});
