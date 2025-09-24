// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import crypto from 'crypto';
import { MemoryRouter } from 'react-router';
import { TextEncoder } from 'util';
import { AppRoutes } from './AppRoutes';
import { act, render, screen, userEvent, UserEvent, waitFor } from './test-utils/render';

const medplum = new MockClient();

describe('OAuthPage', () => {
  async function setup(url: string): Promise<UserEvent> {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <AppRoutes />
          </MemoryRouter>
        </MedplumProvider>
      );
    });

    return user;
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

    const user = await setup(
      '/oauth?client_id=123&redirect_uri=https://example.com/callback&scope=openid+profile&state=abc&nonce=xyz'
    );

    await user.type(screen.getByLabelText('Email *'), 'admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.type(screen.getByLabelText('Password *'), 'password');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Choose scope')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Set scope' }));

    await waitFor(() => expect(window.location.assign).toHaveBeenCalled());
    expect(window.location.assign).toHaveBeenCalled();
  });

  test('Forgot password', async () => {
    const user = await setup('/oauth?client_id=123');

    await user.type(screen.getByLabelText('Email *'), 'admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByText('Forgot password'));
  });

  test('Register', async () => {
    const user = await setup('/oauth?client_id=123');

    await user.click(screen.getByText('Register'));
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
