// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { allOk } from '@medplum/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { writeProjectCeiling, ceilingFromAllowEventDetails } from '../common/configuration';
import { CONNECTION_SEARCH, readConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE, SECRET } from '../common/constants';
import { operationHandler } from '../common/contracts';
import { ensureBotMembership, ensureReconcileCron, requireSharedBot, writeProjectSecrets } from '../common/install';
import { ensurePolicy, PRACTITIONER_POLICY_SNIPPET } from '../common/policies';
import { currentProjectId, projectQuery } from '../common/project';
import { requestSync } from '../common/state';
import { ensureSyncSubscription, ensureWorkSubscription } from '../common/subscriptions';

/*
 * `Project/$google-calendar-install`, run by a customer project admin. Reads the Google OAuth
 * client and settings from project secrets, then creates restricted Bot memberships, policies,
 * scheduling and work-request Subscriptions, and hourly/minute Crons. Re-run it after changing a
 * secret or to repair configuration.
 */

async function execute(medplum: MedplumClient): Promise<Parameters> {
  // The install runs as the calling admin, so their profile names the customer project.
  const projectId = await currentProjectId(medplum);
  const project = await medplum.readResource('Project', projectId);
  for (const feature of ['bots', 'cron'] as const) {
    if (!project.features?.includes(feature)) {
      throw new Error(`This project needs the "${feature}" feature; ask a Medplum super admin to enable it`);
    }
  }

  // A customer admin enters the Google client in the Medplum app (Admin, Project, Secrets).
  // The Secrets tab can store the detail switch as a Boolean.
  const secret = (name: string): string | undefined => {
    const found = project.secret?.find((s) => s.name === name);
    return (
      found?.valueString?.trim() || (name === SECRET.allowEventDetails ? found?.valueBoolean?.toString() : undefined)
    );
  };
  for (const name of [SECRET.clientId, SECRET.clientSecret]) {
    if (!secret(name)) {
      throw new Error(`${name} is not a project secret; add it under Admin, Project, Secrets`);
    }
  }
  const ceiling = ceilingFromAllowEventDetails(secret(SECRET.allowEventDetails)) ?? 'busy-only';

  const syncBot = await requireSharedBot(medplum, BOT_IDENTIFIER_VALUE.sync);
  const reconcileBot = await requireSharedBot(medplum, BOT_IDENTIFIER_VALUE.reconcile);
  const importBot = await requireSharedBot(medplum, BOT_IDENTIFIER_VALUE.inbound);
  const webhookBot = await requireSharedBot(medplum, BOT_IDENTIFIER_VALUE.webhook);
  if (!webhookBot.publicWebhook) {
    throw new Error('Deploy the Google Calendar webhook Bot with publicWebhook enabled');
  }
  for (const bot of [syncBot, reconcileBot, importBot, webhookBot]) {
    if ((bot.timeout ?? 10) > 600) {
      throw new Error('Calendar Bot timeout must not exceed 600 seconds for lease safety');
    }
  }
  const policy = await ensurePolicy(medplum, 'worker');
  await ensureBotMembership(medplum, projectId, importBot, policy);
  const webhookMembership = await ensureBotMembership(
    medplum,
    projectId,
    webhookBot,
    await ensurePolicy(medplum, 'webhook')
  );
  await writeProjectSecrets(medplum, project, {
    [SECRET.webhookUrl]: new URL(`webhook/${webhookMembership.id}`, medplum.getBaseUrl()).toString(),
  });
  await writeProjectCeiling(medplum, ceiling);
  for (const value of [BOT_IDENTIFIER_VALUE.connect, BOT_IDENTIFIER_VALUE.settings, BOT_IDENTIFIER_VALUE.disconnect]) {
    const bot = await requireSharedBot(medplum, value);
    if (bot.runAsUser !== false) {
      throw new Error('Redeploy operation Bots with runAsUser=false before installation');
    }
    await ensureBotMembership(
      medplum,
      projectId,
      bot,
      await ensurePolicy(medplum, value === BOT_IDENTIFIER_VALUE.connect ? 'connect' : 'operation')
    );
  }
  await ensureBotMembership(medplum, projectId, syncBot, policy);
  await ensureSyncSubscription(medplum, syncBot, 'Appointment');
  await ensureSyncSubscription(medplum, syncBot, 'Slot');
  await ensureWorkSubscription(medplum, importBot, 'inbound');
  await ensureWorkSubscription(medplum, reconcileBot, 'outbound');
  const reconcileMembership = await ensureBotMembership(medplum, projectId, reconcileBot, policy);
  const cron = await ensureReconcileCron(medplum, projectId, reconcileBot, reconcileMembership);
  await ensureReconcileCron(medplum, projectId, reconcileBot, reconcileMembership, true);
  for await (const page of medplum.searchResourcePages(
    'Basic',
    await projectQuery(medplum, `${CONNECTION_SEARCH}&_count=200`)
  )) {
    for (const basic of page) {
      if (readConnection(basic)?.status === 'active') {
        await requestSync(medplum, basic.id, ['inbound', 'outbound'], true);
      }
    }
  }

  const outcome: OperationOutcome = {
    ...allOk,
    issue: [
      {
        severity: 'information',
        code: 'informational',
        details: {
          text:
            `Bidirectional Google Calendar sync installed. Reconcile runs hourly (${cron.cronString}); unfinished work is retried each minute. ` +
            `Add these entries to your practitioner AccessPolicy so practitioners can manage their own connection: ` +
            JSON.stringify(PRACTITIONER_POLICY_SNIPPET),
        },
      },
    ],
  };
  // Custom operations discard a bare successful OperationOutcome. Wrap it so the
  // administrator receives the required policy entries through both execution routes.
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'installed', valueBoolean: true },
      { name: 'outcome', resource: outcome },
    ],
  };
}

export const handler = operationHandler('install', execute);
