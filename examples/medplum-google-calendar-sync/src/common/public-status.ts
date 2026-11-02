// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getExtensionValue, getStatus, OperationOutcomeError } from '@medplum/core';
import type { Appointment, Basic, Parameters } from '@medplum/fhirtypes';
import { createHash } from 'node:crypto';
import { readProjectCeiling } from './configuration';
import type { CalendarConnection } from './connection';
import { readConnection } from './connection';
import { GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import { findConflicts, importedSlots, readImportedIdentity } from './import';
import { MIRRORED_APPOINTMENT_STATUSES } from './mapping';
import { connectionStatusParameters } from './operations';
import { PROFILES } from './profiles';
import { projectQuery } from './project';
import { readState, withState } from './state';
import { ifMatch } from './versioning';

export const PUBLIC_STATUS_SEARCH = `code=${N}|calendar-public-status`;
const SYSTEM = `${N}/public-status`;

// Called under the connection lease, never by a caller or webhook. Copy an explicit allowlist.
export async function publishStatus(medplum: MedplumClient, basic: WithId<Basic>): Promise<void> {
  const connection = readConnection(basic);
  if (!connection) {
    return;
  }
  const state = readState(basic);
  const resource: Basic = withState(
    {
      resourceType: 'Basic',
      meta: { profile: [PROFILES.publicStatus] },
      code: { coding: [{ system: N, code: 'calendar-public-status' }] },
      subject: basic.subject,
      identifier: [{ system: SYSTEM, value: `Basic/${basic.id}` }],
      extension: (basic.extension ?? []).filter((e) =>
        ['status', 'account-email', 'event-detail-level'].some((name) => e.url === `${N}/${name}`)
      ),
    },
    {
      conflicts: [],
      channels: [],
      lastInbound: state.lastInbound,
      lastOutbound: state.lastOutbound,
      staleReason: state.staleReason,
      inboundError: state.inboundError,
      outboundError: state.outboundError,
      cleanupIssue: state.cleanupIssue,
      privacyPending: state.privacyPending,
      projectDetailLevel: state.projectDetailLevel,
      conflictsRevision: state.conflictsRevision,
      inboundRequest: state.inboundRequest !== state.inboundCompleted || state.conflictsPending ? 'pending' : undefined,
      outboundRequest: state.outboundRequest !== state.outboundCompleted || state.outboundWork ? 'pending' : undefined,
    }
  );
  const saved = await medplum.createResourceIfNoneExist(
    resource,
    await projectQuery(medplum, { identifier: `${SYSTEM}|Basic/${basic.id}` })
  );
  await medplum.updateResource(
    { ...resource, id: saved.id, meta: { ...saved.meta, profile: [PROFILES.publicStatus] } },
    ifMatch(saved)
  );
}

export async function deletePublicStatus(medplum: MedplumClient, id: string): Promise<void> {
  const record = await medplum.searchOne('Basic', await projectQuery(medplum, { identifier: `${SYSTEM}|Basic/${id}` }));
  if (record) {
    await medplum.deleteResource('Basic', record.id, ifMatch(record));
  }
}

export async function callerStatus(medplum: MedplumClient, practitionerRef: string): Promise<Parameters> {
  const basic = await medplum.searchOne(
    'Basic',
    await projectQuery(medplum, `${PUBLIC_STATUS_SEARCH}&subject=${practitionerRef}`)
  );
  if (!basic) {
    return connectionStatusParameters(undefined);
  }
  const id = basic.identifier?.find((i) => i.system === SYSTEM)?.value?.replace(/^Basic\//, '');
  if (!id) {
    throw new Error('Invalid calendar status identity');
  }
  const connection: CalendarConnection = {
    basic: { ...basic, id },
    practitionerRef,
    accountSub: '',
    status: getExtensionValue(basic, `${N}/status`) as CalendarConnection['status'],
    eventDetailLevel: getExtensionValue(basic, `${N}/event-detail-level`) as CalendarConnection['eventDetailLevel'],
    accountEmail: getExtensionValue(basic, `${N}/account-email`) as string | undefined,
  };
  // Both searches execute with the caller's policy. Unreadable appointments never enter the response.
  const actors = new Set([practitionerRef]);
  for await (const page of medplum.searchResourcePages(
    'PractitionerRole',
    await projectQuery(medplum, { practitioner: practitionerRef })
  )) {
    for (const role of page) {
      actors.add(`PractitionerRole/${role.id}`);
    }
  }
  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60_000);
  const appointments: Appointment[] = [];
  for await (const page of medplum.searchResourcePages(
    'Appointment',
    await projectQuery(medplum, {
      actor: [...actors].join(','),
      status: [...MIRRORED_APPOINTMENT_STATUSES].join(','),
      end: `gt${now.toISOString()}`,
      date: `lt${horizon.toISOString()}`,
      _count: '200',
    })
  )) {
    appointments.push(...page);
  }
  const conflicts = new Map<string, ReturnType<typeof findConflicts>[number]>();
  const permissions = new Map<string, boolean>();
  const readable = async (reference: string): Promise<boolean> => {
    if (permissions.has(reference)) {
      return permissions.get(reference) as boolean;
    }
    try {
      await medplum.readReference({ reference }, { cache: 'no-cache' });
      permissions.set(reference, true);
      return true;
    } catch (err) {
      if (err instanceof OperationOutcomeError && [403, 404, 410].includes(getStatus(err.outcome))) {
        permissions.set(reference, false);
        return false;
      }
      throw err;
    }
  };
  for (const slot of await importedSlots(medplum, id, undefined, {
    end: `gt${now.toISOString()}`,
    start: `lt${horizon.toISOString()}`,
  })) {
    const identity = readImportedIdentity(slot);
    if (!identity) {
      continue;
    }
    for (const conflict of findConflicts(
      id,
      identity.calendarId,
      [{ eventId: identity.eventId, start: slot.start, end: slot.end }],
      [],
      appointments,
      actors,
      now
    )) {
      if (!(await readable(conflict.appointment))) {
        continue;
      }
      conflict.schedules = (await readable(slot.schedule.reference as string))
        ? [slot.schedule.reference as string]
        : [];
      const key = createHash('sha256').update(conflict.key).digest('hex');
      const previous = conflicts.get(key);
      conflicts.set(key, {
        ...conflict,
        key,
        schedules: [...new Set([...(previous?.schedules ?? []), ...conflict.schedules])],
      });
    }
  }
  return connectionStatusParameters(connection, await readProjectCeiling(medplum), [...conflicts.values()]);
}
