// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import { allOk } from '@medplum/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { writeProjectCeiling, ceilingFromAllowEventDetails } from '../common/configuration';
import { CONNECTION_SEARCH, readConnection } from '../common/connection';
import { BOT_IDENTIFIER_VALUE, SECRET } from '../common/constants';
import { operationHandler } from '../common/contracts';
import {
  ensureBotMembership,
  ensureReconcileCron,
  INSTALL_SECRETS,
  requireSharedBot,
  writeProjectSecrets,
} from '../common/install';
import { getParam } from '../common/operations';
import {
  ensureInboundPolicy,
  ensureOperationPolicy,
  ensureSyncAccessPolicy,
  PRACTITIONER_POLICY_SNIPPET,
} from '../common/policies';
import { currentProjectId, projectQuery } from '../common/project';
import { requestSync } from '../common/state';
import { ensureSyncSubscription, ensureWorkSubscription } from '../common/subscriptions';

/*
 * `Project/$google-calendar-install`, run once by a customer project admin. Stores the
 * Google OAuth client and settings, then creates restricted Bot memberships, policies,
 * scheduling and work-request Subscriptions, and hourly/minute Crons. Re-run installation
 * to rotate the client secret or repair configuration.
 */

async function execute(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  // The install runs as the calling admin, so their profile names the customer project.
  const projectId = await currentProjectId(medplum);
  const project = await medplum.readResource('Project', projectId);
  if (!project.features?.includes('bots')) {
    throw new Error('This project needs the "bots" feature; ask a Medplum super admin to enable it');
  }

  // The Google client normally comes from the project secrets the customer admin entered in
  // the Medplum app (Admin, Project, Secrets); parameters override them, for example to rotate.
  const secrets: Record<string, string> = {};
  for (const { name, required } of INSTALL_SECRETS) {
    const value = getParam(event.input, name);
    if (value) {
      secrets[name] = value;
    } else if (required && !project.secret?.some((s) => s.name === name && s.valueString?.trim())) {
      throw new Error(
        `${name} is not a project secret; add it under Admin, Project, Secrets, or pass it as a parameter`
      );
    }
  }
  const allowEventDetails =
    secrets[SECRET.allowEventDetails] ?? project.secret?.find((s) => s.name === SECRET.allowEventDetails)?.valueString;
  const ceiling = ceilingFromAllowEventDetails(allowEventDetails) ?? 'busy-only';

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
  const importPolicy = await ensureInboundPolicy(medplum);
  const webhookPolicy = await ensureInboundPolicy(medplum, true);
  await ensureBotMembership(medplum, projectId, importBot, importPolicy);
  const webhookMembership = await ensureBotMembership(medplum, projectId, webhookBot, webhookPolicy);
  secrets[SECRET.webhookUrl] = new URL(`webhook/${webhookMembership.id}`, medplum.getBaseUrl()).toString();
  await writeProjectSecrets(medplum, project, secrets);
  await writeProjectCeiling(medplum, ceiling);
  for (const value of [
    BOT_IDENTIFIER_VALUE.connect,
    BOT_IDENTIFIER_VALUE.settings,
    BOT_IDENTIFIER_VALUE.disconnect,
    BOT_IDENTIFIER_VALUE.syncRange,
  ]) {
    const bot = await requireSharedBot(medplum, value);
    if (bot.runAsUser !== false) {
      throw new Error('Redeploy operation Bots with runAsUser=false before installation');
    }
    await ensureBotMembership(
      medplum,
      projectId,
      bot,
      await ensureOperationPolicy(medplum, value === BOT_IDENTIFIER_VALUE.connect)
    );
  }
  const policy = await ensureSyncAccessPolicy(medplum);
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
  const reconcileNote = project.features.includes('cron')
    ? `Reconcile runs hourly (${cron.cronString}); unfinished work is retried each minute. `
    : 'Reconcile is not scheduled until a Medplum super admin enables the "cron" feature on this project. ';

  const outcome: OperationOutcome = {
    ...allOk,
    issue: [
      {
        severity: 'information',
        code: 'informational',
        details: {
          text:
            `Bidirectional Google Calendar sync installed. ${reconcileNote}` +
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
