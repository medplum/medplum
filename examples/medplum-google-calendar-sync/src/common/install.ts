// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { AccessPolicy, Bot, Cron, Project, ProjectMembership } from '@medplum/fhirtypes';
import { createHash } from 'node:crypto';
import { BOT_IDENTIFIER_SYSTEM, INSTALL_SYSTEM, SECRET } from './constants';
import { ifMatch } from './lease';
import { projectQuery } from './project';

/*
 * What `Project/$google-calendar-install` creates in a customer project, each piece
 * idempotent and keyed by an identifier or tag so re-running install repairs rather than
 * duplicates.
 */

/** Secrets install accepts, and whether each is required. */
export const INSTALL_SECRETS: { name: string; required: boolean }[] = [
  { name: SECRET.clientId, required: true },
  { name: SECRET.clientSecret, required: true },
  { name: SECRET.appointmentUrl, required: false },
  { name: SECRET.detailLevel, required: false },
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
