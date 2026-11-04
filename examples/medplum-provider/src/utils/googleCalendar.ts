// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { arrayBufferToBase64, encryptSHA256, getRandomString } from '@medplum/core';
import type { Parameters, ParametersParameter, Reference } from '@medplum/fhirtypes';

/*
 * Client side of the Google Calendar sync example (examples/medplum-google-calendar-sync).
 * The Bots do the token exchange and hold the client secret; the browser only needs the
 * public OAuth client ID, which must be the same client the project installed.
 */

export const GOOGLE_CALENDAR_PATH = '/integrations/google-calendar';
export const GOOGLE_CALENDAR_CALLBACK_PATH = `${GOOGLE_CALENDAR_PATH}/callback`;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.calendars.readonly',
];
const PENDING_AUTH_KEY = 'googleCalendarPendingAuth';

export const EVENT_DETAIL_LEVELS = ['busy-only', 'initials', 'full'] as const;
export type EventDetailLevel = (typeof EVENT_DETAIL_LEVELS)[number];

export const EVENT_DETAIL_LEVEL_LABELS: Record<EventDetailLevel, string> = {
  'busy-only': 'Busy only',
  initials: 'Initials',
  full: 'Full details',
};

export interface GoogleCalendarConflict {
  readonly key: string;
  readonly appointment: Reference;
  readonly start: string;
  readonly end: string;
}

export interface GoogleCalendarStatus {
  readonly connected: boolean;
  readonly status?: string;
  readonly email?: string;
  readonly eventDetailLevel?: string;
  readonly effectiveDetailLevel?: string;
  readonly privacyCleanupPending?: boolean;
  readonly inboundPending?: boolean;
  readonly outboundPending?: boolean;
  readonly stale?: boolean;
  readonly staleReason?: string;
  readonly lastSuccessfulInbound?: string;
  readonly lastSuccessfulOutbound?: string;
  readonly activeConflictCount?: number;
  readonly disconnectWarning?: string;
  /** The Google OAuth client ID installed in the project, from the project secrets. */
  readonly clientId?: string;
  readonly conflicts: GoogleCalendarConflict[];
}

interface PendingAuth {
  readonly state: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly eventDetailLevel: EventDetailLevel;
}

/**
 * The Google OAuth client ID to start consent with. The project's installed client, returned by
 * the status operation, is the default; GOOGLE_CALENDAR_CLIENT_ID overrides it for development.
 * @param status - The caller's Google Calendar status.
 * @returns The client ID, or undefined when neither source has one.
 */
export function getGoogleCalendarClientId(status: GoogleCalendarStatus | undefined): string | undefined {
  return import.meta.env.GOOGLE_CALENDAR_CLIENT_ID || status?.clientId || undefined;
}

export function getGoogleCalendarRedirectUri(): string {
  return window.location.origin + GOOGLE_CALENDAR_CALLBACK_PATH;
}

function value(p: ParametersParameter | undefined): string | boolean | number | undefined {
  return p?.valueString ?? p?.valueCode ?? p?.valueInstant ?? p?.valueBoolean ?? p?.valueInteger;
}

export function parseGoogleCalendarStatus(params: Parameters): GoogleCalendarStatus {
  const all = params.parameter ?? [];
  const get = (name: string): string | boolean | number | undefined => value(all.find((p) => p.name === name));
  const str = (name: string): string | undefined => {
    const v = get(name);
    return typeof v === 'string' ? v : undefined;
  };
  const bool = (name: string): boolean | undefined => {
    const v = get(name);
    return typeof v === 'boolean' ? v : undefined;
  };
  const conflicts: GoogleCalendarConflict[] = [];
  for (const c of all.filter((p) => p.name === 'conflict')) {
    const part = (name: string): ParametersParameter | undefined => c.part?.find((p) => p.name === name);
    const appointment = part('appointment')?.valueReference;
    const key = part('key')?.valueString;
    const start = part('start')?.valueInstant;
    const end = part('end')?.valueInstant;
    if (appointment && key && start && end) {
      conflicts.push({ key, appointment, start, end });
    }
  }
  const count = get('activeConflictCount');
  return {
    connected: bool('connected') === true,
    status: str('status'),
    email: str('email'),
    eventDetailLevel: str('eventDetailLevel'),
    effectiveDetailLevel: str('effectiveDetailLevel'),
    privacyCleanupPending: bool('privacyCleanupPending'),
    inboundPending: bool('inboundPending'),
    outboundPending: bool('outboundPending'),
    stale: bool('stale'),
    staleReason: str('staleReason'),
    lastSuccessfulInbound: str('lastSuccessfulInbound'),
    lastSuccessfulOutbound: str('lastSuccessfulOutbound'),
    activeConflictCount: typeof count === 'number' ? count : undefined,
    disconnectWarning: str('disconnectWarning'),
    clientId: str('clientId'),
    conflicts,
  };
}

async function callOperation(
  medplum: MedplumClient,
  operation: string,
  parameter: ParametersParameter[] = []
): Promise<Parameters> {
  return medplum.post(medplum.fhirUrl('Practitioner', `$google-calendar-${operation}`), {
    resourceType: 'Parameters',
    parameter,
  } satisfies Parameters);
}

export async function getGoogleCalendarStatus(medplum: MedplumClient): Promise<GoogleCalendarStatus> {
  return parseGoogleCalendarStatus(await callOperation(medplum, 'status'));
}

export async function connectGoogleCalendar(
  medplum: MedplumClient,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  eventDetailLevel: EventDetailLevel
): Promise<Parameters> {
  return callOperation(medplum, 'connect', [
    { name: 'code', valueString: code },
    { name: 'codeVerifier', valueString: codeVerifier },
    { name: 'redirectUri', valueString: redirectUri },
    { name: 'eventDetailLevel', valueString: eventDetailLevel },
  ]);
}

export async function updateGoogleCalendarDetailLevel(
  medplum: MedplumClient,
  eventDetailLevel: EventDetailLevel
): Promise<Parameters> {
  return callOperation(medplum, 'settings', [{ name: 'eventDetailLevel', valueString: eventDetailLevel }]);
}

export async function disconnectGoogleCalendar(medplum: MedplumClient): Promise<Parameters> {
  return callOperation(medplum, 'disconnect');
}

export async function syncGoogleCalendar(medplum: MedplumClient): Promise<Parameters> {
  return callOperation(medplum, 'sync');
}

/**
 * Builds Google's consent URL with PKCE and saves the verifier and state for the callback page.
 * @param clientId - The public Google OAuth client ID the project installed.
 * @param eventDetailLevel - The detail level to send with the connect request.
 * @returns The Google consent URL to navigate to.
 */
export async function startGoogleCalendarAuth(clientId: string, eventDetailLevel: EventDetailLevel): Promise<string> {
  const state = getRandomString();
  const codeVerifier = getRandomString().slice(0, 128);
  const codeChallenge = arrayBufferToBase64(await encryptSHA256(codeVerifier))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const redirectUri = getGoogleCalendarRedirectUri();
  const pending: PendingAuth = { state, codeVerifier, redirectUri, eventDetailLevel };
  sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));

  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return url.toString();
}

/**
 * Reads and removes the saved PKCE request, and checks the state Google echoed back.
 * @param state - The `state` query parameter from Google's redirect.
 * @returns The saved request, or undefined when it is missing or the state does not match.
 */
export function takePendingGoogleCalendarAuth(state: string | null): PendingAuth | undefined {
  const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
  sessionStorage.removeItem(PENDING_AUTH_KEY);
  if (!raw || !state) {
    return undefined;
  }
  try {
    const pending = JSON.parse(raw) as PendingAuth;
    return pending.state === state ? pending : undefined;
  } catch {
    return undefined;
  }
}

export function isEventDetailLevel(v: unknown): v is EventDetailLevel {
  return EVENT_DETAIL_LEVELS.includes(v as EventDetailLevel);
}
