import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import crypto from 'crypto';
import { MemoryRouter } from 'react-router-dom';
import { TextEncoder } from 'util';
import { AppRoutes } from './AppRoutes';
import { act, fireEvent, render, screen, waitFor } from './test-utils/render';

const medplum = new MockClient();

describe('OAuthPage', () => {
  async function setup(url: string): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <AppRoutes />
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global.self, 'crypto', {
      value: crypto.webcrypto,
    });
  });

  test('Missing clientId', async () => {
    await setup('/oauth');
    expect(screen.queryByTestId('submit')).toBeNull();
  });

  test('Success', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { assign: jest.fn() },
    });

    await setup(
      '/oauth?client_id=123&redirect_uri=https://example.com/callback&scope=openid+profile&state=abc&nonce=xyz'
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password *'), {
        target: { value: 'password' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });

    expect(await screen.findByText('Choose scope')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set scope' }));
    });

    await waitFor(() => expect(window.location.assign).toHaveBeenCalled());
    expect(window.location.assign).toHaveBeenCalled();
  });

  test('Forgot password', async () => {
    await setup('/oauth?client_id=123');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Forgot password'));
    });
  });

  test('Register', async () => {
    await setup('/oauth?client_id=123');

    await act(async () => {
      fireEvent.click(screen.getByText('Register'));
    });
  });
});
