// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MedplumClient } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Appointment, Parameters, Slot } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertDeploymentProject, cliAccessToken } from './deployment-auth';
import { findConnection } from '../common/connection';
import { readCredential } from '../common/credentials';
import { getOAuthClient, refreshAccessToken } from '../common/google-oauth';
import { GoogleCalendarClient } from '../common/google-calendar';
import { importedSlots, practitionerSchedules, readImportedIdentity } from '../common/import';
import { projectQuery } from '../common/project';
import { toGoogleEventId } from '../common/mapping';
import type { GoogleCalendarEvent } from '../common/mapping';
import { ifMatch } from '../common/lease';
import { cleanupFixtures, runWithCleanup, TEST_SYSTEM } from './e2e-fixtures';
import type { TestManifest } from './e2e-fixtures';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== '--cleanup')) {
    throw new Error('Only --cleanup is supported');
  }
  const cleanupOnly = args.includes('--cleanup');
  const path = required('E2E_MANIFEST');
  const projectId = required('PROJECT_ID');
  const baseUrl = new URL(
    process.env.BASE_URL ?? process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/'
  ).toString();
  const medplum = new MedplumClient({ baseUrl });
  medplum.setAccessToken(cliAccessToken(baseUrl, process.env.MEDPLUM_PROFILE));
  await assertDeploymentProject(medplum, projectId);
  const profile = await medplum.getProfileAsync();
  if (profile?.resourceType !== 'Practitioner') {
    throw new Error('Use the connected practitioner CLI login');
  }
  const practitionerRef = `Practitioner/${profile.id}`;
  const connection = await findConnection(medplum, practitionerRef);
  if (connection?.status !== 'active') {
    throw new Error('Reconnect Google before running live tests or cleanup');
  }
  const project = await medplum.readResource('Project', projectId);
  const secrets = Object.fromEntries((project.secret ?? []).map((s) => [s.name, s]));
  const token = await refreshAccessToken(getOAuthClient(secrets), await readCredential(medplum, connection));
  const calendar = new GoogleCalendarClient(token.access_token);
  // Google Calendar drops fractional seconds when storing event times.
  const start = new Date(Math.floor(Date.now() / 1000) * 1000 + 7 * 86400_000).toISOString();
  const end = new Date(Date.parse(start) + 10 * 60_000).toISOString();
  const calendarId = (await calendar.listBusyEvents(start, end)).calendarId;
  const manifest: TestManifest = cleanupOnly
    ? (JSON.parse(readFileSync(path, 'utf8')) as TestManifest)
    : {
        version: 1,
        run: randomUUID(),
        baseUrl,
        projectId,
        practitionerRef,
        connectionId: connection.basic.id,
        accountSub: connection.accountSub,
        calendarId,
        googleEventId: `e2e${randomUUID().replaceAll('-', '')}`,
        start,
        end,
        checks: [],
        cleanupComplete: false,
      };
  if (
    manifest.version !== 1 ||
    !/^[a-f0-9-]{36}$/.test(manifest.run) ||
    !/^e2e[a-f0-9]{32}$/.test(manifest.googleEventId) ||
    manifest.baseUrl !== baseUrl ||
    manifest.projectId !== projectId ||
    manifest.practitionerRef !== practitionerRef ||
    manifest.connectionId !== connection.basic.id ||
    manifest.accountSub !== connection.accountSub ||
    manifest.calendarId !== calendarId
  ) {
    throw new Error('Manifest does not match the authenticated project, practitioner and Google connection');
  }
  const save = (): void => {
    writeFileSync(`${path}.tmp`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  };
  if (!cleanupOnly) {
    mkdirSync(dirname(path), { recursive: true });
    // Persist discovery keys BEFORE writes, including writes whose response might be lost.
    writeFileSync(path, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  }
  let interrupted = false;
  const interrupt = (): void => {
    interrupted = true;
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  const waitFor = async (label: string, check: () => Promise<boolean>): Promise<void> => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      if (interrupted) {
        throw new Error('Interrupted; cleaning test fixtures');
      }
      if (await check()) {
        manifest.checks.push(label);
        save();
        console.log(`PASS ${label}`);
        return;
      }
      await delay(5000);
    }
    throw new Error(`Timed out: ${label}`);
  };
  try {
    await runWithCleanup(
      async () => {
        if (cleanupOnly) {
          return;
        }
        const schedules = await practitionerSchedules(medplum, practitionerRef);
        if (!schedules.length) {
          throw new Error('At least one active practitioner Schedule is required');
        }
        const status = await medplum.post<Parameters>('fhir/R4/Practitioner/$google-calendar-status', {
          resourceType: 'Parameters',
        });
        if (!status.parameter?.some((p) => p.name === 'connected' && p.valueBoolean)) {
          throw new Error('Status operation is not connected');
        }
        let appointment = await medplum.createResourceIfNoneExist<Appointment>(
          {
            resourceType: 'Appointment',
            identifier: [{ system: TEST_SYSTEM, value: manifest.run }],
            status: 'booked',
            start,
            end,
            description: `Medplum E2E ${manifest.run}`,
            participant: [{ actor: { reference: practitionerRef }, status: 'accepted' }],
          },
          await projectQuery(medplum, { identifier: `${TEST_SYSTEM}|${manifest.run}` })
        );
        const mirrorId = toGoogleEventId(appointment.id);
        if (!mirrorId) {
          throw new Error('Cannot derive mirror identity');
        }
        await waitFor('outbound create through deployed Subscription', async () => {
          const event = await calendar.getEvent(mirrorId);
          return (
            event?.extendedProperties?.private?.medplumProject === projectId &&
            event?.extendedProperties?.private?.medplumConnection === connection.basic.id &&
            event?.extendedProperties?.private?.medplumSource === `Appointment/${appointment.id}` &&
            !event?.attendees?.some((a) => !('self' in a && a.self === true)) &&
            event?.status !== 'cancelled' &&
            event?.start?.dateTime !== undefined &&
            Date.parse(event.start.dateTime) === Date.parse(start)
          );
        });
        const movedStart = new Date(Date.parse(start) + 3600_000).toISOString();
        const movedEnd = new Date(Date.parse(end) + 3600_000).toISOString();
        appointment = await medplum.updateResource(
          { ...appointment, start: movedStart, end: movedEnd },
          ifMatch(appointment)
        );
        await waitFor(
          'outbound update',
          async () => Date.parse((await calendar.getEvent(mirrorId))?.start?.dateTime ?? '') === Date.parse(movedStart)
        );
        appointment = await medplum.updateResource({ ...appointment, status: 'cancelled' }, ifMatch(appointment));
        await waitFor('outbound cancellation', async () => {
          const event = await calendar.getEvent(mirrorId);
          return !event || event.status === 'cancelled';
        });
        const fixture: GoogleCalendarEvent = {
          id: manifest.googleEventId,
          status: 'confirmed',
          summary: `Medplum E2E ${manifest.run}`,
          start: { dateTime: start },
          end: { dateTime: end },
          transparency: 'opaque',
          visibility: 'private',
          attendees: [],
          reminders: { useDefault: false },
          extendedProperties: { private: { medplumE2ERun: manifest.run, medplumE2EProject: projectId } },
        };
        let inserted = await calendar.insertEvent(fixture);
        if (!inserted.etag) {
          throw new Error('Google fixture response has no ETag');
        }
        const fixtureSlots = async (): Promise<WithId<Slot>[]> =>
          (await importedSlots(medplum, connection.basic.id)).filter((slot) => {
            const identity = readImportedIdentity(slot);
            return identity?.calendarId === calendarId && identity.eventId === manifest.googleEventId;
          });
        const slotsMatch = async (from: string, to: string): Promise<boolean> => {
          const slots = await fixtureSlots();
          return (
            slots.length === schedules.length &&
            schedules.every((schedule) =>
              slots.some(
                (slot) =>
                  slot.schedule.reference === `Schedule/${schedule.id}` &&
                  slot.status === 'busy-unavailable' &&
                  Date.parse(slot.start) === Date.parse(from) &&
                  Date.parse(slot.end) === Date.parse(to)
              )
            )
          );
        };
        await waitFor('inbound create through deployed notification/recovery', () => slotsMatch(start, end));
        inserted = await calendar.updateEvent(
          fixture.id,
          { ...fixture, start: { dateTime: movedStart }, end: { dateTime: movedEnd } },
          inserted.etag
        );
        await waitFor('inbound update on all active Schedules', () => slotsMatch(movedStart, movedEnd));
        if (!inserted.etag) {
          throw new Error('Google fixture response has no ETag');
        }
        await calendar.deleteEvent(fixture.id, inserted.etag);
        await waitFor('inbound removal', async () => (await fixtureSlots()).length === 0);
      },
      async () => {
        manifest.cleanupComplete = false;
        try {
          save();
        } finally {
          await cleanupFixtures(medplum, calendar, manifest);
        }
        manifest.cleanupComplete = true;
        save();
        console.log('CLEANUP complete; cancelled test Appointment retained as an audit record');
      }
    );
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

main().catch((error: unknown) => {
  const messages = error instanceof AggregateError ? error.errors : [error];
  for (const item of messages) {
    console.error(item instanceof Error ? item.message : 'Live test failed');
  }
  console.error('Run test:e2e:cleanup with the same E2E_MANIFEST if cleanup did not complete.');
  process.exitCode = 1;
});
