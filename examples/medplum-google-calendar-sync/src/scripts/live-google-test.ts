// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { GOOGLE_CALENDAR_METADATA_SCOPE, GOOGLE_CALENDAR_SCOPE } from '../common/constants';
import { GoogleApiError, GoogleCalendarClient } from '../common/google-calendar';
import { exchangeCode, hasImportScopes, readIdToken, refreshAccessToken } from '../common/google-oauth';
import type { GoogleCalendarEvent } from '../common/mapping';
import { removeTestEvent } from './e2e-fixtures';

/*
 * Checks, against a real Google account, the Calendar API behaviours the sync relies on
 * but Google doesn't document. Run once per Google Cloud client before trusting the design:
 *
 *   GOOGLE_CLIENT_SECRET_JSON=~/Downloads/client_secret_….json npx tsx src/scripts/live-google-test.ts
 *
 * Use a Desktop-type client: it accepts any loopback port without registration. The
 * script opens a consent URL, receives the code on that port, then creates and deletes a
 * few test events on the primary calendar (all tagged, all removed at the end) without revoking
 * the account grant. Nothing is written to Medplum.
 */

const PORT = 8765;
// Google's loopback rule for Desktop clients wants the IP form; the `localhost` hostname is rejected.
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const TAG = `live-test-${Date.now()}`;

// Google adds the calendar owner as a guest, flagged `self`/`organizer`; the mapping never writes those.
function guests(event: GoogleCalendarEvent | undefined): { email: string; self?: boolean; organizer?: boolean }[] {
  return event?.attendees ?? [];
}

interface Check {
  name: string;
  result: 'PASS' | 'FAIL' | 'INFO';
  detail: string;
}
const checks: Check[] = [];
function record(name: string, result: Check['result'], detail: string): void {
  checks.push({ name, result, detail });
  console.log(`${result.padEnd(4)} ${name}: ${detail}`);
}

function loadClient(): { clientId: string; clientSecret: string } {
  const path = process.env.GOOGLE_CLIENT_SECRET_JSON;
  if (!path) {
    throw new Error('Set GOOGLE_CLIENT_SECRET_JSON to the downloaded client_secret JSON path');
  }
  const json = JSON.parse(readFileSync(path.replace(/^~/, process.env.HOME ?? ''), 'utf8')) as {
    web?: { client_id: string; client_secret: string };
    installed?: { client_id: string; client_secret: string };
  };
  const client = json.web ?? json.installed;
  if (!client) {
    throw new Error('Unrecognised client secret JSON');
  }
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

async function authorize(client: { clientId: string; clientSecret: string }): Promise<string> {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: `openid email ${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_CALENDAR_METADATA_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const incoming = new URL(req.url ?? '/', REDIRECT_URI);
      if (incoming.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const error = incoming.searchParams.get('error');
      const received = incoming.searchParams.get('code');
      if (error || !received || incoming.searchParams.get('state') !== state) {
        res.writeHead(400).end(`Authorization failed: ${error ?? 'bad state or no code'}`);
        server.close();
        reject(new Error(error ?? 'bad state or no code'));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' }).end('Authorized. You can close this tab.');
      server.close();
      resolve(received);
    });
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`\nOpen this URL in a browser signed in to the test Workspace account:\n\n${url.toString()}\n`);
    });
  });

  const tokens = await exchangeCode(client, { code, codeVerifier: verifier, redirectUri: REDIRECT_URI });
  record('refresh token granted', tokens.refresh_token ? 'PASS' : 'FAIL', tokens.refresh_token ? 'present' : 'missing');
  record('both calendar scopes granted', hasImportScopes(tokens.scope) ? 'PASS' : 'FAIL', tokens.scope);
  const account = readIdToken(tokens.id_token as string);
  record('account', 'INFO', account.hd ? 'Workspace account' : 'Personal account');

  const refreshed = await refreshAccessToken(client, tokens.refresh_token as string);
  record('refresh token exchange', 'PASS', `expires_in=${refreshed.expires_in}`);
  return refreshed.access_token;
}

function testEvent(id: string, summary: string): GoogleCalendarEvent {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    id,
    status: 'confirmed',
    summary,
    description: 'Medplum live test; safe to delete',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    transparency: 'opaque',
    visibility: 'private',
    attendees: [],
    reminders: { useDefault: true },
    extendedProperties: { private: { medplumProject: TAG, medplumSource: `Appointment/${id}` } },
  };
}

async function status(client: GoogleCalendarClient, id: string): Promise<string> {
  try {
    const event = await client.getEvent(id);
    return event ? `200 status=${event.status}` : '404/410';
  } catch (err) {
    return err instanceof GoogleApiError ? `${err.status} ${err.reason ?? ''}` : String(err);
  }
}

async function main(): Promise<void> {
  const client = loadClient();
  const accessToken = await authorize(client);
  const calendar = new GoogleCalendarClient(accessToken);
  const id = `a${randomBytes(15).toString('hex')}`; // 31 chars in [a-f0-9]

  try {
    // 1. The write scope covers the primary calendar.
    await calendar.insertEvent(testEvent(id, 'Medplum live test'));
    record('insert on primary with calendar.events.owned', 'PASS', id);

    // 2. Full replace clears location. Attendees stay empty; invitation delivery is not tested.
    const withLocation = {
      ...testEvent(id, 'Medplum live test'),
      location: 'Test Clinic',
      attendees: [],
    };
    await calendar.updateEvent(id, withLocation);
    let stored = await calendar.getEvent(id);
    record(
      'owner auto-added as attendee',
      'INFO',
      JSON.stringify(guests(stored).map((a) => ({ self: a.self, organizer: a.organizer })))
    );
    await calendar.updateEvent(id, testEvent(id, 'Medplum live test'));
    stored = await calendar.getEvent(id);
    record('replace clears location', !stored?.location ? 'PASS' : 'FAIL', `location=${stored?.location ?? '(none)'}`);
    record(
      'replace clears guests',
      !guests(stored).some((a) => !a.self) ? 'PASS' : 'FAIL',
      JSON.stringify(stored?.attendees ?? [])
    );

    // 3. List by private property.
    const listed = await calendar.listEvents([`medplumProject=${TAG}`]);
    record(
      'list by privateExtendedProperty',
      listed.some((e) => e.id === id) ? 'PASS' : 'FAIL',
      `${listed.length} event(s)`
    );

    // 4. Delete, then what does get return, and do the tags survive on the tombstone?
    await calendar.deleteEvent(id);
    const afterDelete = await status(calendar, id);
    record('get after delete', 'INFO', afterDelete);
    try {
      const tombstone = await calendar.getEvent(id);
      record(
        'tags survive on tombstone',
        tombstone?.extendedProperties?.private?.medplumSource ? 'PASS' : 'FAIL',
        JSON.stringify(tombstone?.extendedProperties ?? null)
      );
    } catch {
      record('tags survive on tombstone', 'INFO', 'tombstone not readable');
    }

    // 5. Reinsert the same id: 409?
    try {
      await calendar.insertEvent(testEvent(id, 'Medplum live test (reinsert)'));
      record('reinsert deleted id', 'INFO', 'insert succeeded (no 409)');
    } catch (err) {
      record(
        'reinsert deleted id',
        'INFO',
        err instanceof GoogleApiError ? `${err.status} ${err.reason ?? ''}` : String(err)
      );
    }

    // 6. Restore via full replace with status confirmed.
    try {
      await calendar.updateEvent(id, testEvent(id, 'Medplum live test (restored)'));
      const restored = await calendar.getEvent(id);
      record(
        'replace restores tombstone',
        restored?.status === 'confirmed' ? 'PASS' : 'FAIL',
        `status=${restored?.status ?? '?'}`
      );
    } catch (err) {
      record(
        'replace restores tombstone',
        'FAIL',
        err instanceof GoogleApiError ? `${err.status} ${err.reason ?? ''}` : String(err)
      );
    }

    // 7. Cleanup, and confirm the client's own upsert behaves end to end.
    await calendar.deleteEvent(id);
    const outcome = await calendar.upsertEvent(testEvent(id, 'Medplum live test (upsert)'));
    record('upsert on a deleted id', 'INFO', outcome);
    await calendar.deleteEvent(id);
  } finally {
    await removeTestEvent(calendar, id, { medplumProject: TAG, medplumSource: `Appointment/${id}` });
  }
  record('cleanup', 'PASS', 'test event removed; existing grants preserved');

  if (checks.some((check) => check.result === 'FAIL')) {
    throw new Error('Google API probe failed');
  }
  console.log('\nSummary');
  for (const check of checks) {
    console.log(`  ${check.result.padEnd(4)} ${check.name}: ${check.detail}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
