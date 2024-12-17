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

  test('Fetch and render client info', async () => {
    const mockClientInfo = {
      welcomeString: 'Test Client',
      logo: { contentType: 'image/png', url: 'https://example.com/logo.png', title: 'Test Logo' },
    };
    jest.spyOn(medplum, 'get').mockResolvedValue(mockClientInfo);

    await setup('/oauth?client_id=123');
    await waitFor(() => expect(medplum.get).toHaveBeenCalledWith('/auth/clientinfo/123'));
    expect(screen.getByText('Test Client')).toBeInTheDocument();
    const logo = screen.getByAltText('Welcome Logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  test('Fetch empty payload and render default info', async () => {
    const mockClientInfo = {};
    jest.spyOn(medplum, 'get').mockResolvedValue(mockClientInfo);

    await setup('/oauth?client_id=123');
    await waitFor(() => expect(medplum.get).toHaveBeenCalledWith('/auth/clientinfo/123'));
    expect(screen.getByText('Sign in to Medplum')).toBeInTheDocument();
    expect(screen.getByText('Medplum Logo')).toBeInTheDocument();
  });

  test('Fetch logo and render default welcome string', async () => {
    const mockClientInfo = {
      logo: { contentType: 'image/png', url: 'https://example.com/logo.png', title: 'Test Logo' },
    };
    jest.spyOn(medplum, 'get').mockResolvedValue(mockClientInfo);

    await setup('/oauth?client_id=123');
    await waitFor(() => expect(medplum.get).toHaveBeenCalledWith('/auth/clientinfo/123'));
    expect(screen.getByText('Sign in to Medplum')).toBeInTheDocument();
    const logo = screen.getByAltText('Welcome Logo');
    expect(logo).toBeInTheDocument();
  });

  test('Do not fetch client info when client_id is medplum-cli', async () => {
    jest.spyOn(medplum, 'get').mockReset();
    const mockGet = jest.spyOn(medplum, 'get');
    await setup('/oauth?client_id=medplum-cli');
    expect(mockGet).not.toHaveBeenCalled();
  });
});
