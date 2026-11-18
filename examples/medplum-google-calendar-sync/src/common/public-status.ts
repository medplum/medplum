// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getExtensionValue } from '@medplum/core';
import type { Basic, Parameters } from '@medplum/fhirtypes';
import { readProjectCeiling } from './configuration';
import type { CalendarConnection } from './connection';
import { CONNECTION_STATUSES, readCode, readConnection } from './connection';
import { EVENT_DETAIL_LEVELS, GOOGLE_CALENDAR_NAMESPACE as N } from './constants';
import { connectionStatusParameters } from './operations';
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
      code: { coding: [{ system: N, code: 'calendar-public-status' }] },
      subject: basic.subject,
      identifier: [{ system: SYSTEM, value: `Basic/${basic.id}` }],
      extension: (basic.extension ?? []).filter((e) =>
        ['status', 'account-email', 'event-detail-level'].some((name) => e.url === `${N}/${name}`)
      ),
    },
    {
      channels: [],
      lastInbound: state.lastInbound,
      lastOutbound: state.lastOutbound,
      staleReason: state.staleReason,
      inboundError: state.inboundError,
      outboundError: state.outboundError,
      cleanupIssue: state.cleanupIssue,
      privacyPending: state.privacyPending,
      projectDetailLevel: state.projectDetailLevel,
      inboundRequest: state.inboundRequest !== state.inboundCompleted ? 'pending' : undefined,
      outboundRequest: state.outboundRequest !== state.outboundCompleted ? 'pending' : undefined,
    }
  );
  const saved = await medplum.createResourceIfNoneExist(
    resource,
    await projectQuery(medplum, { identifier: `${SYSTEM}|Basic/${basic.id}` })
  );
  await medplum.updateResource({ ...resource, id: saved.id, meta: saved.meta }, ifMatch(saved));
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
  const status = readCode(basic, `${N}/status`, CONNECTION_STATUSES);
  const eventDetailLevel = readCode(basic, `${N}/event-detail-level`, EVENT_DETAIL_LEVELS);
  if (!status || (basic.extension?.some((e) => e.url === `${N}/event-detail-level`) && !eventDetailLevel)) {
    return {
      resourceType: 'Parameters',
      parameter: [
        { name: 'connected', valueBoolean: true },
        { name: 'stale', valueBoolean: true },
        { name: 'staleReason', valueCode: 'invalid-public-status' },
      ],
    };
  }
  const connection: CalendarConnection = {
    basic: { ...basic, id },
    practitionerRef,
    accountSub: '',
    status,
    eventDetailLevel,
    accountEmail: getExtensionValue(basic, `${N}/account-email`) as string | undefined,
  };
  return connectionStatusParameters(connection, await readProjectCeiling(medplum));
}
