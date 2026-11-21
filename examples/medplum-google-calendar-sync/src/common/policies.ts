// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import type { AccessPolicy } from '@medplum/fhirtypes';
import { CONFIG_SEARCH } from './configuration';
import { CONNECTION_SEARCH } from './connection';
import { BOT_IDENTIFIER_SYSTEM, BOT_IDENTIFIER_VALUE, IMPORT_IDENTIFIER_SYSTEM, INSTALL_SYSTEM } from './constants';
import { CREDENTIAL_CRITERIA } from './credentials';
import { MIRROR_SEARCH } from './ownership';
import { projectQuery } from './project';
import { PUBLIC_STATUS_SEARCH } from './public-status';
import { ifMatch } from './versioning';

/** The Bots behind the practitioner operations (`Practitioner/$google-calendar-*`). */
const OPERATION_BOT_CRITERIA = `Bot?identifier=${[
  BOT_IDENTIFIER_VALUE.connect,
  BOT_IDENTIFIER_VALUE.status,
  BOT_IDENTIFIER_VALUE.settings,
  BOT_IDENTIFIER_VALUE.disconnect,
]
  .map((value) => `${BOT_IDENTIFIER_SYSTEM}|${value}`)
  .join(',')}`;

/**
 * AccessPolicy entries for practitioners to read their own public calendar status and the
 * project settings, and to invoke the operations: the server resolves an operation by reading
 * its OperationDefinition and Bot as the caller before the Bot runs. Private connections,
 * credentials and worker state are not included.
 */
export const PRACTITIONER_POLICY_SNIPPET: NonNullable<AccessPolicy['resource']> = [
  {
    resourceType: 'Basic',
    criteria: `Basic?${PUBLIC_STATUS_SEARCH}&subject=%profile`,
    interaction: ['read', 'search'],
  },
  { resourceType: 'Basic', criteria: `Basic?${CONFIG_SEARCH}`, readonly: true },
  { resourceType: 'OperationDefinition', readonly: true },
  { resourceType: 'Bot', criteria: OPERATION_BOT_CRITERIA, readonly: true },
];

type PolicyEntry = NonNullable<AccessPolicy['resource']>[number];
export type PolicyKind = 'worker' | 'webhook' | 'connect' | 'operation';

/**
 * The only grants on the refresh token. Workers read it; the connect Bot writes it.
 * @param interaction - What the policy may do with the stored token.
 * @returns The policy entry.
 */
function credentialGrant(interaction: NonNullable<PolicyEntry['interaction']>): PolicyEntry {
  return { resourceType: 'Basic', criteria: CREDENTIAL_CRITERIA, interaction };
}

const CONNECTION: PolicyEntry = { resourceType: 'Basic', criteria: `Basic?${CONNECTION_SEARCH}` };
const PUBLIC_STATUS: PolicyEntry = { resourceType: 'Basic', criteria: `Basic?${PUBLIC_STATUS_SEARCH}` };
const CONFIG: PolicyEntry = { resourceType: 'Basic', criteria: `Basic?${CONFIG_SEARCH}`, readonly: true };
const OPERATION: PolicyEntry[] = [{ resourceType: 'Practitioner', readonly: true }, CONNECTION, PUBLIC_STATUS, CONFIG];

/** One policy per trust level; every Bot membership in a customer project runs under one of these. */
const POLICIES: Record<PolicyKind, { name: string; resource: PolicyEntry[] }> = {
  // The sync and import Bots: read scheduling data, write only what the integration owns.
  worker: {
    name: 'Google Calendar Worker',
    resource: [
      // Prefer: respond-async creates a job through the caller's repository.
      { resourceType: 'AsyncJob', interaction: ['create'] },
      {
        resourceType: 'Bot',
        criteria: `Bot?identifier=${BOT_IDENTIFIER_SYSTEM}|${BOT_IDENTIFIER_VALUE.sync},${BOT_IDENTIFIER_SYSTEM}|${BOT_IDENTIFIER_VALUE.inbound}`,
        readonly: true,
      },
      ...(
        ['Appointment', 'Slot', 'Schedule', 'Patient', 'Practitioner', 'PractitionerRole', 'HealthcareService'] as const
      ).map((resourceType) => ({ resourceType, readonly: true })),
      { resourceType: 'Slot', criteria: `Slot?identifier=${IMPORT_IDENTIFIER_SYSTEM}|` },
      CONNECTION,
      PUBLIC_STATUS,
      CONFIG,
      { resourceType: 'Basic', criteria: `Basic?${MIRROR_SEARCH}` },
      credentialGrant(['read', 'search', 'delete']),
    ],
  },
  // The public webhook only flags a connection for import.
  webhook: {
    name: 'Google Calendar Webhook',
    resource: [{ ...CONNECTION, interaction: ['read', 'search', 'update'] }],
  },
  connect: {
    name: 'Google Calendar Connect',
    resource: [...OPERATION, credentialGrant(['create', 'read', 'search', 'update'])],
  },
  // The settings and disconnect Bots never touch the token.
  operation: { name: 'Google Calendar Operations', resource: OPERATION },
};

/**
 * Creates or repairs one of the integration's policies in the customer project.
 * @param medplum - The client.
 * @param kind - Which policy.
 * @returns The policy.
 */
export async function ensurePolicy(medplum: MedplumClient, kind: PolicyKind): Promise<WithId<AccessPolicy>> {
  const tag = { system: INSTALL_SYSTEM, code: `${kind}-policy` };
  const desired: AccessPolicy = { resourceType: 'AccessPolicy', meta: { tag: [tag] }, ...POLICIES[kind] };
  const saved = await medplum.createResourceIfNoneExist(
    desired,
    await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` })
  );
  return medplum.updateResource({ ...desired, id: saved.id, meta: { ...saved.meta, ...desired.meta } }, ifMatch(saved));
}
