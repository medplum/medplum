// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { notFound, OperationOutcomeError } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, userEvent, waitFor } from '../../test-utils/render';
import { GoogleCalendarCallbackPage } from './GoogleCalendarCallbackPage';
import { GoogleCalendarPage } from './GoogleCalendarPage';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';

const connectedStatus: Parameters = {
  resourceType: 'Parameters',
  parameter: [
    { name: 'connected', valueBoolean: true },
    { name: 'status', valueCode: 'active' },
    { name: 'email', valueString: 'practitioner@example.com' },
    { name: 'eventDetailLevel', valueCode: 'busy-only' },
    { name: 'effectiveDetailLevel', valueCode: 'busy-only' },
    { name: 'stale', valueBoolean: false },
    { name: 'lastSuccessfulInbound', valueInstant: '2026-01-01T12:00:00.000Z' },
    { name: 'activeConflictCount', valueInteger: 1 },
    {
      name: 'conflict',
      part: [
        { name: 'key', valueString: 'abc' },
        { name: 'appointment', valueReference: { reference: 'Appointment/123', display: 'Follow-up visit' } },
        { name: 'start', valueInstant: '2026-01-02T15:00:00.000Z' },
        { name: 'end', valueInstant: '2026-01-02T15:30:00.000Z' },
      ],
    },
    { name: 'disconnectWarning', valueString: 'Imported busy time will be removed.' },
  ],
};

const disconnectedStatus: Parameters = {
  resourceType: 'Parameters',
  parameter: [{ name: 'connected', valueBoolean: false }],
};

function operationOf(url: unknown): string {
  return String(url).split('$google-calendar-')[1];
}

describe('GoogleCalendarPage', () => {
  let medplum: MockClient;
  let post: ReturnType<typeof vi.spyOn>;
  let assign: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    medplum = new MockClient();
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', CLIENT_ID);
    sessionStorage.clear();
    assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, origin: 'http://localhost:3001', assign },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
  });

  function mockOperations(handlers: Record<string, (body: Parameters) => Parameters | Promise<Parameters>>): void {
    post = vi.spyOn(medplum, 'post').mockImplementation(async (url: unknown, body: unknown) => {
      const handler = handlers[operationOf(url)];
      if (!handler) {
        throw new Error(`Unexpected request ${String(url)}`);
      }
      return handler(body as Parameters);
    });
  }

  function setup(path = '/integrations/google-calendar'): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[path]}>
          <Notifications />
          <Routes>
            <Route path="/integrations/google-calendar" element={<GoogleCalendarPage />} />
            <Route path="/integrations/google-calendar/callback" element={<GoogleCalendarCallbackPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  test('Shows connected status and conflicts', async () => {
    mockOperations({ status: () => connectedStatus });
    setup();

    expect(await screen.findByText('practitioner@example.com')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Follow-up visit')).toHaveAttribute('href', '/Appointment/123');
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Google Calendar' })).not.toBeInTheDocument();
  });

  test('Shows install guidance when the operation is missing', async () => {
    mockOperations({
      status: () => {
        throw new OperationOutcomeError(notFound);
      },
    });
    setup();

    expect(await screen.findByText('Google Calendar sync is not installed')).toBeInTheDocument();
  });

  test('Shows other errors', async () => {
    mockOperations({
      status: () => {
        throw new Error('Boom');
      },
    });
    setup();

    expect(await screen.findByText('Could not load Google Calendar status')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  test('Connect redirects to Google with PKCE and saves the verifier', async () => {
    mockOperations({ status: () => disconnectedStatus });
    setup();

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());

    const url = new URL(assign.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3001/integrations/google-calendar/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.events.owned');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.calendars.readonly');

    const saved = JSON.parse(sessionStorage.getItem('googleCalendarPendingAuth') ?? '{}');
    expect(saved.state).toBe(url.searchParams.get('state'));
    expect(saved.codeVerifier).toHaveLength(128);
    expect(saved.eventDetailLevel).toBe('busy-only');
  });

  test('Connect is disabled without a client ID', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', '');
    mockOperations({ status: () => disconnectedStatus });
    setup();

    expect(await screen.findByRole('button', { name: 'Connect Google Calendar' })).toBeDisabled();
    expect(screen.getByText(/no Google OAuth client installed/)).toBeInTheDocument();
  });

  test('Connect uses the client ID installed in the project when no override is set', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', '');
    mockOperations({
      status: () => ({
        resourceType: 'Parameters',
        parameter: [
          { name: 'connected', valueBoolean: false },
          { name: 'clientId', valueString: 'installed-client.apps.googleusercontent.com' },
        ],
      }),
    });
    setup();

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(new URL(assign.mock.calls[0][0] as string).searchParams.get('client_id')).toBe(
      'installed-client.apps.googleusercontent.com'
    );
  });

  test('Reauth required offers reconnect', async () => {
    mockOperations({
      status: () => ({
        resourceType: 'Parameters',
        parameter: [
          { name: 'connected', valueBoolean: true },
          { name: 'status', valueCode: 'reauth-required' },
        ],
      }),
    });
    setup();

    expect(await screen.findByRole('button', { name: 'Reconnect Google Calendar' })).toBeEnabled();
    expect(screen.getByText('Reconnect required')).toBeInTheDocument();
  });

  test('Disconnect asks for confirmation and calls the operation', async () => {
    const disconnect = vi.fn(() => disconnectedStatus);
    mockOperations({ status: () => connectedStatus, disconnect });
    setup();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText('Imported busy time will be removed.')).toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Disconnect', hidden: true }));
    await waitFor(() => expect(disconnect).toHaveBeenCalled());
  });

  test('Saves a changed detail level', async () => {
    const settings = vi.fn((body: Parameters) => {
      expect(body.parameter).toEqual([{ name: 'eventDetailLevel', valueString: 'initials' }]);
      return connectedStatus;
    });
    mockOperations({ status: () => connectedStatus, settings });
    setup();

    const user = userEvent.setup();
    const save = await screen.findByRole('button', { name: 'Save detail setting' });
    expect(save).toBeDisabled();

    await user.click(screen.getByDisplayValue('Busy only'));
    await user.click(await screen.findByRole('option', { name: 'Initials', hidden: true }));
    expect(save).toBeEnabled();

    await user.click(save);
    await waitFor(() => expect(settings).toHaveBeenCalled());
  });

  test('Sync now queues a sync', async () => {
    const sync = vi.fn((): Parameters => ({ resourceType: 'Parameters' }));
    mockOperations({ status: () => connectedStatus, sync });
    setup();

    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(sync).toHaveBeenCalled());
  });

  test('Callback sends the code and verifier to the connect operation', async () => {
    sessionStorage.setItem(
      'googleCalendarPendingAuth',
      JSON.stringify({
        state: 'state-1',
        codeVerifier: 'verifier-1',
        redirectUri: 'http://localhost:3001/integrations/google-calendar/callback',
        eventDetailLevel: 'initials',
      })
    );
    const connect = vi.fn(() => connectedStatus);
    mockOperations({ connect, status: () => connectedStatus });
    setup('/integrations/google-calendar/callback?code=code-1&state=state-1');

    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(connect.mock.calls[0]).toEqual([
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'code', valueString: 'code-1' },
          { name: 'codeVerifier', valueString: 'verifier-1' },
          { name: 'redirectUri', valueString: 'http://localhost:3001/integrations/google-calendar/callback' },
          { name: 'eventDetailLevel', valueString: 'initials' },
        ],
      },
    ]);
    expect(await screen.findByText('practitioner@example.com')).toBeInTheDocument();
    expect(sessionStorage.getItem('googleCalendarPendingAuth')).toBeNull();
  });

  test('Callback rejects a mismatched state', async () => {
    sessionStorage.setItem(
      'googleCalendarPendingAuth',
      JSON.stringify({ state: 'expected', codeVerifier: 'v', redirectUri: 'r', eventDetailLevel: 'busy-only' })
    );
    mockOperations({});
    setup('/integrations/google-calendar/callback?code=code-1&state=other');

    expect(await screen.findByText('Could not connect Google Calendar')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('Callback reports a denied consent', async () => {
    sessionStorage.setItem(
      'googleCalendarPendingAuth',
      JSON.stringify({ state: 's', codeVerifier: 'v', redirectUri: 'r', eventDetailLevel: 'busy-only' })
    );
    mockOperations({});
    setup('/integrations/google-calendar/callback?error=access_denied&state=s');

    expect(await screen.findByText('Google Calendar access was not granted.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test('Callback shows connect errors', async () => {
    sessionStorage.setItem(
      'googleCalendarPendingAuth',
      JSON.stringify({ state: 's', codeVerifier: 'v', redirectUri: 'r', eventDetailLevel: 'busy-only' })
    );
    mockOperations({
      connect: () => {
        throw new Error('invalid_grant');
      },
    });
    setup('/integrations/google-calendar/callback?code=c&state=s');

    expect(await screen.findByText('invalid_grant')).toBeInTheDocument();
  });
});
