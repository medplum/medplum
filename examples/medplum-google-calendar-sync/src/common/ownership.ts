// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import { createHash } from 'node:crypto';
import type { CalendarConnection } from './connection';
import { EVENT_PROPERTY, GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import type { ConnectionLease } from './lease';
import type { GoogleCalendarEvent } from './mapping';
import { PROFILES } from './profiles';
import { projectQuery } from './project';
import { ifMatch } from './versioning';

export const MIRROR_SEARCH = `code=${N}|calendar-mirror`;
const SYSTEM = `${N}/mirror`;
export interface OwnershipStore {
  remember: (event: GoogleCalendarEvent) => Promise<void>;
  has: (event: GoogleCalendarEvent) => Promise<boolean>;
  ownsPrevious?: (event: GoogleCalendarEvent, previousConnection: string) => Promise<boolean>;
}
/**
 * Per-event receipts avoid an unbounded array on the connection or credential.
 * @param lease - Exclusive connection lease.
 * @param connection - Account and project binding for receipts.
 * @returns A receipt store bound to this connection.
 */
export function ownershipStore(lease: ConnectionLease, connection: CalendarConnection): OwnershipStore {
  const bound = (event: GoogleCalendarEvent): boolean =>
    event.extendedProperties.private[EVENT_PROPERTY.project] === connection.basic.meta?.project &&
    event.extendedProperties.private[EVENT_PROPERTY.connection] === connection.basic.id;
  const identity = (event: GoogleCalendarEvent): string =>
    createHash('sha256')
      .update(
        JSON.stringify([
          connection.basic.meta?.project,
          connection.basic.id,
          connection.accountSub,
          event.id,
          event.extendedProperties.private[EVENT_PROPERTY.source],
        ])
      )
      .digest('hex');
  const continuity = (event: GoogleCalendarEvent): string =>
    createHash('sha256')
      .update(
        JSON.stringify([
          connection.basic.meta?.project,
          connection.accountSub,
          connection.practitionerRef,
          event.id,
          event.extendedProperties.private[EVENT_PROPERTY.source],
        ])
      )
      .digest('hex');
  const receipts = async (event: GoogleCalendarEvent): Promise<WithId<Basic>[]> =>
    lease.medplum.searchResources(
      'Basic',
      await projectQuery(lease.medplum, { identifier: `${SYSTEM}-account|${continuity(event)}` })
    );
  const query = async (event: GoogleCalendarEvent): Promise<string> =>
    projectQuery(lease.medplum, { identifier: `${SYSTEM}|${identity(event)}` });
  return {
    remember: async (event) => {
      if (!bound(event)) {
        throw new Error('Mirror receipt does not match its connection');
      }
      // Finish evidence persistence after the work deadline, but never after losing/expiring the lease.
      await lease.read(true);
      const saved = await lease.medplum.createResourceIfNoneExist<Basic>(
        {
          resourceType: 'Basic',
          meta: { profile: [PROFILES.mirror] },
          code: { coding: [{ system: N, code: 'calendar-mirror' }] },
          subject: { reference: `Basic/${connection.basic.id}` },
          identifier: [
            { system: SYSTEM, value: identity(event) },
            { system: `${SYSTEM}-account`, value: continuity(event) },
          ],
        },
        await query(event)
      );
      if (!saved.identifier?.some((i) => i.system === `${SYSTEM}-account` && i.value === continuity(event))) {
        await lease.read(true);
        await lease.medplum.updateResource(
          {
            ...saved,
            identifier: [...(saved.identifier ?? []), { system: `${SYSTEM}-account`, value: continuity(event) }],
          },
          ifMatch(saved)
        );
      }
    },
    ownsPrevious: async (event, previousConnection) => {
      if (!bound(event)) {
        return false;
      }
      await lease.check();
      return (await receipts(event)).some((r) => r.subject?.reference === `Basic/${previousConnection}`);
    },
    has: async (event) => {
      if (!bound(event)) {
        return false;
      }
      await lease.check();
      const receipt = await lease.medplum.searchOne('Basic', await query(event));
      return receipt?.subject?.reference === `Basic/${connection.basic.id}` || (await receipts(event)).length > 0;
    },
  };
}
