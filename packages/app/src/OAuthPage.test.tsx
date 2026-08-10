// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { locationUtils } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import crypto from 'crypto';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import type { UserEvent } from './test-utils/render';
import { act, render, screen, userEvent, waitFor } from './test-utils/render';

const medplum = new MockClient();

describe('OAuthPage', () => {
  async function setup(url: string): Promise<UserEvent> {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum} navigate={vi.fn()}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <AppRoutes />
          </MemoryRouter>
        </MedplumProvider>
      );
    });

    return user;
  }

  beforeAll(() => {
    Object.defineProperty(global.self, 'crypto', {
      value: crypto.webcrypto,
    });
  });

  test('Missing clientId', async () => {
    await setup('/oauth');
    expect(screen.queryByTestId('submit')).toBeNull();
  });

  test('Success', async () => {
    locationUtils.assign = vi.fn();

    const user = await setup(
      '/oauth?client_id=123&redirect_uri=https://example.com/callback&scope=openid+profile&state=abc&nonce=xyz'
    );

    await user.type(screen.getByLabelText('Email *'), 'admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText('Password *'), 'password');

    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Choose scope')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Set Scope' }));

    await waitFor(() => expect(locationUtils.assign).toHaveBeenCalled());
    expect(locationUtils.assign).toHaveBeenCalled();
  });

  test('Forgot password', async () => {
    const user = await setup('/oauth?client_id=123');

    await user.type(screen.getByLabelText('Email *'), 'admin@example.com');

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByText('Reset Password'));
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
    vi.spyOn(medplum, 'get').mockResolvedValue(mockClientInfo);

    await setup('/oauth?client_id=123');
    await waitFor(() => expect(medplum.get).toHaveBeenCalledWith('/auth/clientinfo/123'));
    expect(screen.getByText('Test Client')).toBeInTheDocument();
    const logo = screen.getByAltText('Welcome Logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  test('Fetch empty payload and render default info', async () => {
    const mockClientInfo = {};
    vi.spyOn(medplum, 'get').mockResolvedValue(mockClientInfo);

    await setup('/oauth?client_id=123');
    await waitFor(() => expect(medplum.get).toHaveBeenCalledWith('/auth/clientinfo/123'));
    expect(screen.getByText('Sign in to Medplum')).toBeInTheDocument();
    expect(screen.getByText('Medplum Logo')).toBeInTheDocument();
  });

  test('Fetch logo and render default welcome string', async () => {
    const mockClientInfo = {
      logo: { contentType: 'image/png', url: 'https://example.com/logo.png', title: 'Test Logo' },
    };
    vi.spyOn(medplum, 'get').mockResolvedValue(mockClientInfo);

    await setup('/oauth?client_id=123');
    await waitFor(() => expect(medplum.get).toHaveBeenCalledWith('/auth/clientinfo/123'));
    expect(screen.getByText('Sign in to Medplum')).toBeInTheDocument();
    const logo = screen.getByAltText('Welcome Logo');
    expect(logo).toBeInTheDocument();
  });

  test('Do not fetch client info when client_id is medplum-cli', async () => {
    vi.spyOn(medplum, 'get').mockReset();
    const mockGet = vi.spyOn(medplum, 'get');
    await setup('/oauth?client_id=medplum-cli');
    expect(mockGet).not.toHaveBeenCalled();
    // The sign in form must still render, even though there is no client info to wait for
    expect(screen.getByLabelText('Email *')).toBeInTheDocument();
  });

  async function signIn(user: UserEvent): Promise<void> {
    await user.type(screen.getByLabelText('Email *'), 'admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Password *'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
  }

  test('Skip scope selection when showScopeSelection is false', async () => {
    locationUtils.assign = vi.fn();
    vi.spyOn(medplum, 'get').mockResolvedValue({ showScopeSelection: false });

    const user = await setup(
      '/oauth?client_id=123&redirect_uri=https://example.com/callback&scope=openid+profile&state=abc&nonce=xyz'
    );
    await signIn(user);

    // The requested scope is not "openid", so the legacy check would have shown the scope screen
    await waitFor(() => expect(locationUtils.assign).toHaveBeenCalled());
    expect(screen.queryByText('Choose scope')).toBeNull();
  });

  test('Show scope selection when showScopeSelection is true', async () => {
    locationUtils.assign = vi.fn();
    vi.spyOn(medplum, 'get').mockResolvedValue({ showScopeSelection: true });

    const user = await setup(
      '/oauth?client_id=123&redirect_uri=https://example.com/callback&scope=openid&state=abc&nonce=xyz'
    );
    await signIn(user);

    // The requested scope is "openid", so the legacy check would have skipped the scope screen
    expect(await screen.findByText('Choose scope')).toBeInTheDocument();
    expect(locationUtils.assign).not.toHaveBeenCalled();
  });

  test('Fall back to requested scope when showScopeSelection is not configured', async () => {
    locationUtils.assign = vi.fn();
    vi.spyOn(medplum, 'get').mockResolvedValue({ welcomeString: 'Test Client' });

    const user = await setup(
      '/oauth?client_id=123&redirect_uri=https://example.com/callback&scope=openid+profile&state=abc&nonce=xyz'
    );
    await signIn(user);

    expect(await screen.findByText('Choose scope')).toBeInTheDocument();
  });
});
