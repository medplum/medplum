// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getStatus, OperationOutcomeError } from '@medplum/core';
import type { AccessPolicy } from '@medplum/fhirtypes';
import { CONFIG_SEARCH } from './configuration';
import { CONNECTION_SEARCH } from './connection';
import { BOT_IDENTIFIER_SYSTEM, BOT_IDENTIFIER_VALUE, IMPORT_IDENTIFIER_SYSTEM, INSTALL_SYSTEM } from './constants';
import { CREDENTIAL_SEARCH } from './credentials';
import { ifMatch } from './lease';
import { MIRROR_SEARCH } from './ownership';
import { projectQuery } from './project';
import { PUBLIC_STATUS_SEARCH } from './public-status';

/**
 * AccessPolicy entries for practitioners to read their own public calendar status and the
 * project settings. Private connections, credentials and worker state are not included.
 */
export const PRACTITIONER_POLICY_SNIPPET: NonNullable<AccessPolicy['resource']> = [
  {
    resourceType: 'Basic',
    criteria: `Basic?${PUBLIC_STATUS_SEARCH}&subject=%profile`,
    interaction: ['read', 'search'],
  },
  { resourceType: 'Basic', criteria: `Basic?${CONFIG_SEARCH}`, readonly: true },
];

/** Apply within existing Slot scope; remove broader write grants before relying on this restriction. */
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

export async function auditPolicyGrants(
  medplum: MedplumClient,
  projectId: string,
  expectedWorkers: string[] = []
): Promise<string[]> {
  const policies: WithId<AccessPolicy>[] = [];
  for await (const page of medplum.searchResourcePages(
    'AccessPolicy',
    await projectQuery(medplum, { _count: '200' })
  )) {
    policies.push(...page);
  }
  // Conservative structural audit: arbitrary criteria, parameters and compartments cannot
  // be proved safe from a handful of synthetic fixtures. Warn unless a grant is known safe.
  const risky = new Set(
    policies
      .filter((policy) =>
        policy.resource?.some((r) => {
          if (!['*', 'Basic', 'Slot'].includes(r.resourceType)) {
            return false;
          }
          const writes =
            !r.readonly && (!r.interaction || r.interaction.some((i) => ['create', 'update', 'delete'].includes(i)));
          if (r.resourceType === 'Slot') {
            return writes && r.criteria !== `Slot?identifier:not=${IMPORT_IDENTIFIER_SYSTEM}|`;
          }
          if (r.resourceType === 'Basic') {
            const safeRead =
              !writes &&
              (r.criteria === `Basic?${CONFIG_SEARCH}` ||
                (r.criteria === `Basic?${PUBLIC_STATUS_SEARCH}&subject=%profile` &&
                  r.interaction?.every((i) => ['read', 'search'].includes(i))));
            return !safeRead;
          }
          return true;
        })
      )
      .map((policy) => `AccessPolicy/${policy.id}`)
  );
  const warnings: string[] = [];
  for await (const page of medplum.searchResourcePages('ProjectMembership', {
    project: `Project/${projectId}`,
    _count: '200',
  })) {
    for (const member of page) {
      const references = [
        member.accessPolicy?.reference,
        ...(member.access ?? []).map((a) => a.policy?.reference),
      ].filter(Boolean);
      const policy = policies.find((p) => member.accessPolicy?.reference === `AccessPolicy/${p.id}`);
      const knownPolicy = policy?.meta?.tag?.some(
        (tag) =>
          tag.system === INSTALL_SYSTEM &&
          ['sync-policy', 'import-policy', 'webhook-policy', 'connect-policy', 'operation-policy'].includes(
            tag.code ?? ''
          )
      );
      const boundedWorkerPolicy = policy?.resource?.every((r) => {
        if (r.resourceType === '*') {
          return false;
        }
        if (r.resourceType === 'Basic') {
          return [CONNECTION_SEARCH, PUBLIC_STATUS_SEARCH, CREDENTIAL_SEARCH, MIRROR_SEARCH, CONFIG_SEARCH].some(
            (query) => r.criteria === `Basic?${query}`
          );
        }
        if (r.resourceType === 'Slot' && !r.readonly) {
          return r.criteria === `Slot?identifier=${IMPORT_IDENTIFIER_SYSTEM}|`;
        }
        return r.readonly === true;
      });
      if (
        !member.admin &&
        !member.access?.length &&
        member.profile?.reference?.startsWith('Bot/') &&
        knownPolicy &&
        boundedWorkerPolicy
      ) {
        try {
          const bot = await medplum.readReference(member.profile);
          if (
            bot.resourceType === 'Bot' &&
            bot.identifier?.some(
              (i) =>
                i.system === BOT_IDENTIFIER_SYSTEM &&
                Object.values(BOT_IDENTIFIER_VALUE).includes(i.value as typeof BOT_IDENTIFIER_VALUE.sync)
            )
          ) {
            expectedWorkers.push(`ProjectMembership/${member.id}`);
            continue;
          }
        } catch (err) {
          if (!(err instanceof OperationOutcomeError && [403, 404, 410].includes(getStatus(err.outcome)))) {
            throw err;
          }
          warnings.push(`ProjectMembership/${member.id}`);
          continue;
        }
      }
      if (
        member.admin ||
        !references.length ||
        references.some((ref) => risky.has(ref as string) || !policies.some((p) => ref === `AccessPolicy/${p.id}`))
      ) {
        warnings.push(`ProjectMembership/${member.id}`);
      }
    }
  }
  return warnings;
}
