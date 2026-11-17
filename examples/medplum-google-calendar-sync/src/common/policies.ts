// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import type { AccessPolicy } from '@medplum/fhirtypes';
import { CONFIG_SEARCH } from './configuration';
import { CONNECTION_SEARCH } from './connection';
import { BOT_IDENTIFIER_SYSTEM, BOT_IDENTIFIER_VALUE, IMPORT_IDENTIFIER_SYSTEM, INSTALL_SYSTEM } from './constants';
import { CREDENTIAL_SEARCH } from './credentials';
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
  BOT_IDENTIFIER_VALUE.syncRange,
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

/**
 * Optional hardening: entries that stop a Slot writer from changing imported Slots. They take
 * effect only when they replace that writer's broader Slot write grants. Install does not apply them.
 */
export const ORDINARY_SLOT_POLICY_SNIPPET: AccessPolicy['resource'] = [
  { resourceType: 'Slot', criteria: `Slot?identifier:not=${IMPORT_IDENTIFIER_SYSTEM}|` },
  { resourceType: 'Slot', criteria: `Slot?identifier=${IMPORT_IDENTIFIER_SYSTEM}|`, readonly: true },
];

/**
 * The policy the sync and reconcile Bots run under in the customer project: read what the
 * mapping needs, and read and update Calendar Connections.
 * @param medplum - The client.
 * @returns The policy.
 */
export async function ensureSyncAccessPolicy(medplum: MedplumClient): Promise<WithId<AccessPolicy>> {
  const tag = { system: INSTALL_SYSTEM, code: 'sync-policy' };
  const desired: AccessPolicy = {
    resourceType: 'AccessPolicy',
    meta: { tag: [tag] },
    name: 'Google Calendar Sync Bot',
    resource: [
      // Prefer: respond-async creates a job through the caller's repository.
      { resourceType: 'AsyncJob', interaction: ['create'] },
      {
        resourceType: 'Bot',
        criteria: `Bot?identifier=${BOT_IDENTIFIER_SYSTEM}|${BOT_IDENTIFIER_VALUE.reconcile},${BOT_IDENTIFIER_SYSTEM}|${BOT_IDENTIFIER_VALUE.inbound}`,
        readonly: true,
      },
      { resourceType: 'Appointment', readonly: true },
      { resourceType: 'Slot', readonly: true },
      { resourceType: 'Schedule', readonly: true },
      { resourceType: 'Patient', readonly: true },
      { resourceType: 'Practitioner', readonly: true },
      { resourceType: 'PractitionerRole', readonly: true },
      { resourceType: 'HealthcareService', readonly: true },
      { resourceType: 'Basic', criteria: `Basic?${CONNECTION_SEARCH}` },
      { resourceType: 'Basic', criteria: `Basic?${PUBLIC_STATUS_SEARCH}` },
      { resourceType: 'Basic', criteria: `Basic?${CREDENTIAL_SEARCH}` },
      { resourceType: 'Basic', criteria: `Basic?${MIRROR_SEARCH}` },
      { resourceType: 'Basic', criteria: `Basic?${CONFIG_SEARCH}`, readonly: true },
    ],
  };
  const existing = await medplum.searchOne(
    'AccessPolicy',
    await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` })
  );
  return existing
    ? medplum.updateResource(
        { ...desired, id: existing.id, meta: { ...existing.meta, ...desired.meta } },
        ifMatch(existing)
      )
    : medplum.createResourceIfNoneExist(desired, await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` }));
}

export async function ensureInboundPolicy(medplum: MedplumClient, webhookOnly = false): Promise<WithId<AccessPolicy>> {
  const tag = { system: INSTALL_SYSTEM, code: webhookOnly ? 'webhook-policy' : 'import-policy' };
  const resource: AccessPolicy['resource'] = [
    {
      resourceType: 'Basic',
      criteria: `Basic?${CONNECTION_SEARCH}`,
      ...(webhookOnly ? { interaction: ['read', 'search', 'update'] as ('read' | 'search' | 'update')[] } : {}),
    },
  ];
  if (!webhookOnly) {
    resource.push(
      { resourceType: 'Basic', criteria: `Basic?${PUBLIC_STATUS_SEARCH}` },
      { resourceType: 'Basic', criteria: `Basic?${CREDENTIAL_SEARCH}` },
      { resourceType: 'Basic', criteria: `Basic?${MIRROR_SEARCH}` },
      { resourceType: 'Slot', criteria: `Slot?identifier=${IMPORT_IDENTIFIER_SYSTEM}|` },
      { resourceType: 'Schedule', readonly: true },
      { resourceType: 'PractitionerRole', readonly: true },
      { resourceType: 'Appointment', readonly: true }
    );
  }
  const desired: AccessPolicy = {
    resourceType: 'AccessPolicy',
    meta: { tag: [tag] },
    name: webhookOnly ? 'Google Calendar Webhook' : 'Google Calendar Import',
    resource,
  };
  const query = await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` });
  const saved = await medplum.createResourceIfNoneExist(desired, query);
  return medplum.updateResource({ ...desired, id: saved.id, meta: { ...saved.meta, ...desired.meta } }, ifMatch(saved));
}

export async function ensureOperationPolicy(
  medplum: MedplumClient,
  credentials: boolean
): Promise<WithId<AccessPolicy>> {
  const tag = { system: INSTALL_SYSTEM, code: credentials ? 'connect-policy' : 'operation-policy' };
  const desired: AccessPolicy = {
    resourceType: 'AccessPolicy',
    meta: { tag: [tag] },
    name: 'Google Calendar operations',
    resource: [
      { resourceType: 'Practitioner', readonly: true },
      { resourceType: 'Basic', criteria: `Basic?${CONNECTION_SEARCH}` },
      { resourceType: 'Basic', criteria: `Basic?${PUBLIC_STATUS_SEARCH}` },
      { resourceType: 'Basic', criteria: `Basic?${CONFIG_SEARCH}`, readonly: true },
      ...(credentials ? [{ resourceType: 'Basic' as const, criteria: `Basic?${CREDENTIAL_SEARCH}` }] : []),
    ],
  };
  const saved = await medplum.createResourceIfNoneExist(
    desired,
    await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` })
  );
  return medplum.updateResource({ ...desired, id: saved.id, meta: { ...saved.meta, ...desired.meta } }, ifMatch(saved));
}
