// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * What `Project/$google-calendar-install` creates in a customer project, each piece
 * idempotent and keyed by an identifier or tag so re-running install repairs rather than
 * duplicates.
 */

import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString, getStatus, OperationOutcomeError } from '@medplum/core';
import type { AccessPolicy, Bot, Cron, Project, ProjectMembership, Subscription } from '@medplum/fhirtypes';
import { createHash } from 'node:crypto';
import { CONFIG_SEARCH } from './configuration';
import { CONNECTION_SEARCH } from './connection';
import {
  BOT_IDENTIFIER_SYSTEM,
  BOT_IDENTIFIER_VALUE,
  GOOGLE_CALENDAR_NAMESPACE,
  IMPORT_IDENTIFIER_SYSTEM,
  SECRET,
} from './constants';
import { CREDENTIAL_SEARCH } from './credentials';
import { ifMatch } from './lease';
import { MIRROR_SEARCH } from './ownership';
import { projectQuery } from './project';
import { PUBLIC_STATUS_SEARCH } from './public-status';
import { STATE_URL } from './state';

/** Memberships are keyed by an identifier, and AccessPolicy and Subscription (which have none) by a tag, in this system. */
export const INSTALL_SYSTEM = `${GOOGLE_CALENDAR_NAMESPACE}/install`;
const SUBSCRIPTION_INTERACTION_EXTENSION_URL =
  'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction';

/** Secrets install accepts, and whether each is required. */
export const INSTALL_SECRETS: { name: string; required: boolean }[] = [
  { name: SECRET.clientId, required: true },
  { name: SECRET.clientSecret, required: true },
  { name: SECRET.appointmentUrl, required: false },
  { name: SECRET.detailLevel, required: false },
];

/**
 * The AccessPolicy entries a customer adds to their practitioner policy: their own Calendar
 * Connection and nothing else under `Basic`. The connection carries reauthentication state.
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
 * Finds a shared Bot by identifier; the shared project must be linked for this to succeed.
 * @param medplum - The client, in the customer project.
 * @param value - The Bot identifier value.
 * @returns The Bot.
 */
export async function requireSharedBot(medplum: MedplumClient, value: string): Promise<WithId<Bot>> {
  const matches = await medplum.searchResources('Bot', {
    identifier: `${BOT_IDENTIFIER_SYSTEM}|${value}`,
    _count: '2',
  });
  if (matches.length > 1) {
    throw new Error(`Multiple shared Bots for ${value}; restrict project links before installing`);
  }
  const bot = matches[0];
  if (!bot) {
    throw new Error(
      `Bot ${value} not found. Link the shared Medplum project to this project and deploy the Bots with \`npm run deploy\`.`
    );
  }
  return bot;
}

/**
 * Writes secrets with add-or-replace, so a rotated Google client secret takes effect.
 * @param medplum - The client.
 * @param project - The customer project.
 * @param secrets - Name to value.
 */
export async function writeProjectSecrets(
  medplum: MedplumClient,
  project: WithId<Project>,
  secrets: Record<string, string>
): Promise<void> {
  const secret = (project.secret ?? []).filter((s) => !(s.name in secrets));
  for (const [name, valueString] of Object.entries(secrets)) {
    secret.push({ name, valueString });
  }
  await medplum.updateResource({ ...project, secret }, ifMatch(project));
}

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

/**
 * A membership for a shared Bot in the customer project, which is what lets a Subscription
 * here deliver to it and what it runs as.
 * @param medplum - The client.
 * @param projectId - The customer project ID.
 * @param bot - The shared Bot.
 * @param policy - The policy to run under.
 * @returns The membership.
 */
export async function ensureBotMembership(
  medplum: MedplumClient,
  projectId: string,
  bot: WithId<Bot>,
  policy: WithId<AccessPolicy>
): Promise<WithId<ProjectMembership>> {
  const botRef = getReferenceString(bot);
  const identifier = { system: INSTALL_SYSTEM, value: `membership/${bot.id}` };
  const desired: ProjectMembership = {
    resourceType: 'ProjectMembership',
    identifier: [identifier],
    project: { reference: `Project/${projectId}` },
    user: { reference: botRef },
    profile: { reference: botRef },
    accessPolicy: { reference: getReferenceString(policy) },
    admin: false,
    active: true,
  };
  // The admin Bot-create endpoint already creates a home-project membership. Adopt that
  // membership in a single-project sandbox instead of creating an ambiguous second identity.
  const query = new URLSearchParams({ project: `Project/${projectId}`, profile: botRef }).toString();
  const memberships = await medplum.searchResources('ProjectMembership', query);
  if (memberships.length > 1) {
    throw new Error(`Multiple memberships for ${botRef}; consolidate them before installing Calendar sync`);
  }
  const existing = memberships[0];
  return existing
    ? medplum.updateResource(
        { ...desired, id: existing.id, meta: { ...existing.meta, ...desired.meta } },
        ifMatch(existing)
      )
    : medplum.createResourceIfNoneExist(desired, query);
}

/**
 * One active Subscription per resource type that delivers every create, update and delete to
 * the sync Bot. The endpoint must be the literal `Bot/<id>`; an identifier isn't accepted.
 * @param medplum - The client.
 * @param syncBot - The shared sync Bot.
 * @param criteria - Scheduling resource type.
 * @param deleteOnly - Separate deletion delivery without a transition expression.
 * @returns The Subscription.
 */
export async function ensureSyncSubscription(
  medplum: MedplumClient,
  syncBot: WithId<Bot>,
  criteria: 'Appointment' | 'Slot' | 'Schedule' | 'PractitionerRole',
  deleteOnly = false
): Promise<WithId<Subscription>> {
  const tag = { system: INSTALL_SYSTEM, code: `subscription-${criteria.toLowerCase()}${deleteOnly ? '-delete' : ''}` };
  const normalInteractions = ['Schedule', 'PractitionerRole'].includes(criteria)
    ? ['create', 'update']
    : ['create', 'update', 'delete'];
  const desired: Subscription = {
    resourceType: 'Subscription',
    meta: { tag: [tag] },
    status: 'active',
    reason: `Mirror ${criteria} changes to practitioners' Google Calendars`,
    criteria,
    channel: { type: 'rest-hook', endpoint: getReferenceString(syncBot) },
    extension: [
      ...(criteria === 'Slot'
        ? [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
              valueString: `(%current.exists() and %current.identifier.where(system='${IMPORT_IDENTIFIER_SYSTEM}').empty()) or (%previous.exists() and %previous.identifier.where(system='${IMPORT_IDENTIFIER_SYSTEM}').empty())`,
            },
          ]
        : []),
      ...(!deleteOnly && ['Schedule', 'PractitionerRole'].includes(criteria)
        ? [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
              valueString: `%previous.empty() or %current.empty() or (%previous.active ~ %current.active).not() or (%previous.${criteria === 'Schedule' ? 'actor' : 'practitioner'} ~ %current.${criteria === 'Schedule' ? 'actor' : 'practitioner'}).not()`,
            },
          ]
        : []),
      ...(deleteOnly ? ['delete'] : normalInteractions).map((valueCode) => ({
        url: SUBSCRIPTION_INTERACTION_EXTENSION_URL,
        valueCode,
      })),
    ],
  };
  const existing = await medplum.searchOne(
    'Subscription',
    await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` })
  );
  return existing
    ? medplum.updateResource(
        { ...desired, id: existing.id, meta: { ...existing.meta, ...desired.meta } },
        ifMatch(existing)
      )
    : medplum.createResourceIfNoneExist(desired, await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` }));
}

/**
 * Hourly, at a minute derived from the project ID so customers don't all fire together.
 * @param projectId - The customer project ID.
 * @returns A cron string.
 */
export function hourlyCronString(projectId: string): string {
  const minute = createHash('sha256').update(projectId).digest().readUInt32BE(0) % 60;
  return `${minute} * * * *`;
}

/**
 * The Cron that runs the reconcile Bot hourly as its membership in this project. The server
 * only schedules it when the project has the `cron` feature; the resource is created either
 * way so enabling the feature later needs no reinstall.
 * @param medplum - The client.
 * @param projectId - The customer project ID.
 * @param reconcileBot - The shared reconcile Bot.
 * @param membership - The reconcile Bot's membership here.
 * @param retry - Whether this is the minute recovery sweep for unfinished work.
 * @returns The Cron.
 */
export async function ensureReconcileCron(
  medplum: MedplumClient,
  projectId: string,
  reconcileBot: WithId<Bot>,
  membership: WithId<ProjectMembership>,
  retry = false
): Promise<WithId<Cron>> {
  const identifier = { system: INSTALL_SYSTEM, value: retry ? 'work-cron' : 'reconcile-cron' };
  const desired: Cron = {
    resourceType: 'Cron',
    identifier: [identifier],
    active: true,
    cronString: retry ? '* * * * *' : hourlyCronString(projectId),
    targetReference: { reference: getReferenceString(reconcileBot) },
    onBehalfOf: { reference: getReferenceString(membership) },
  };
  const existing = await medplum.searchOne(
    'Cron',
    await projectQuery(medplum, { identifier: `${identifier.system}|${identifier.value}` })
  );
  return existing
    ? medplum.updateResource(
        { ...desired, id: existing.id, meta: { ...existing.meta, ...desired.meta } },
        ifMatch(existing)
      )
    : medplum.createResourceIfNoneExist(
        desired,
        await projectQuery(medplum, { identifier: `${identifier.system}|${identifier.value}` })
      );
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

export function transitionExpression(field: string): string {
  const path = `extension.where(url='${STATE_URL}').extension.where(url='${field}').valueString`;
  return `%current.${path}.exists() and (%previous.${path}.empty() or %previous.${path} != %current.${path})`;
}

export async function ensureWorkSubscription(
  medplum: MedplumClient,
  bot: WithId<Bot>,
  direction: 'inbound' | 'outbound'
): Promise<void> {
  const tag = { system: INSTALL_SYSTEM, code: `${direction}-work` };
  const desired: Subscription = {
    resourceType: 'Subscription',
    meta: { tag: [tag] },
    status: 'active',
    reason: `Process requested Google Calendar ${direction} work`,
    criteria: `Basic?${CONNECTION_SEARCH}`,
    channel: { type: 'rest-hook', endpoint: getReferenceString(bot) },
    extension: [
      { url: SUBSCRIPTION_INTERACTION_EXTENSION_URL, valueCode: 'create' },
      { url: SUBSCRIPTION_INTERACTION_EXTENSION_URL, valueCode: 'update' },
      {
        url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression',
        valueString: transitionExpression(`${direction}Request`),
      },
    ],
  };
  const saved = await medplum.createResourceIfNoneExist(
    desired,
    await projectQuery(medplum, { _tag: `${tag.system}|${tag.code}` })
  );
  await medplum.updateResource({ ...desired, id: saved.id, meta: { ...saved.meta, ...desired.meta } }, ifMatch(saved));
}

/**
 * Customer-owned workflow; this helper does not install or send notifications.
 * @param botReference - Customer-owned workflow Bot endpoint.
 * @param signal - State transition to observe.
 * @returns A Subscription for the administrator to install.
 */
export function notificationSubscription(botReference: string, signal: 'reauth' | 'conflicts'): Subscription {
  if (!/^Bot\/[A-Za-z0-9.-]+$/.test(botReference)) {
    throw new Error('A customer Bot reference is required');
  }
  const status = `extension.where(url='${GOOGLE_CALENDAR_NAMESPACE}/status').valueCode`;
  const expression =
    signal === 'conflicts'
      ? transitionExpression('conflictsRevision')
      : `%current.${status} = 'reauth-required' and (%previous.${status}.empty() or %previous.${status} != 'reauth-required')`;
  return {
    resourceType: 'Subscription',
    status: 'active',
    reason: `Customer workflow for Google Calendar ${signal}`,
    criteria: `Basic?${PUBLIC_STATUS_SEARCH}`,
    channel: { type: 'rest-hook', endpoint: botReference },
    extension: [
      { url: SUBSCRIPTION_INTERACTION_EXTENSION_URL, valueCode: 'create' },
      { url: SUBSCRIPTION_INTERACTION_EXTENSION_URL, valueCode: 'update' },
      { url: 'https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression', valueString: expression },
    ],
  };
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
