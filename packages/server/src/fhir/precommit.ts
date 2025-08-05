// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BackgroundJobInteraction,
  ContentType,
  createReference,
  getExtension,
  normalizeOperationOutcome,
  OperationOutcomeError,
  Operator,
  resourceMatchesSubscriptionCriteria,
  WithId,
} from '@medplum/core';
import { Bot, Project, Reference, Resource, Subscription } from '@medplum/fhirtypes';
import { executeBot } from '../bots/execute';
import { getConfig } from '../config/loader';
import { getLogger } from '../logger';
import { findProjectMembership } from '../workers/utils';
import { getSystemRepo } from './repo';

export const PRE_COMMIT_SUBSCRIPTION_URL = 'https://medplum.com/fhir/StructureDefinition/pre-commit-bot';

export function isPreCommitSubscription(subscription: WithId<Subscription>): boolean {
  return getExtension(subscription, PRE_COMMIT_SUBSCRIPTION_URL)?.valueBoolean === true;
}

/**
 * Performs pre-commit validation for a resource by executing any associated pre-commit bots.
 * Throws an error if the bot execution fails.
 * @param author - The author of the resource, used to check against blacklisted authors for pre-commit
 * @param project  - The project to which the resource belongs. Must be passed separately because this is called before the resource meta is assigned.
 * @param resource  - The resource to validate.
 * @param interaction - The interaction type (e.g., 'create', 'update', 'delete').
 * @returns The validated resource if a pre-commit bot returns one, otherwise undefined.
 */
export async function preCommitValidation<T extends Resource>(
  author: Reference,
  project: WithId<Project> | undefined,
  resource: T,
  interaction: BackgroundJobInteraction
): Promise<T | boolean | undefined> {
  // reject if the server does not have pre-commit enabled
  // or if the project does not have pre-commit enabled
  if (
    !getConfig().preCommitSubscriptionsEnabled ||
    !project?.setting?.find((s) => s.name === 'preCommitSubscriptionsEnabled')?.valueBoolean
  ) {
    return undefined;
  }

  resource.meta = { ...resource.meta, author };
  const systemRepo = getSystemRepo();
  const logger = getLogger();
  const subscriptions = await systemRepo.searchResources<Subscription>({
    resourceType: 'Subscription',
    count: 1000,
    filters: [
      {
        code: '_project',
        operator: Operator.EQUALS,
        value: project.id,
      },
      {
        code: 'status',
        operator: Operator.EQUALS,
        value: 'active',
      },
    ],
  });

  for (const subscription of subscriptions) {
    // Only consider pre-commit subscriptions
    if (!isPreCommitSubscription(subscription)) {
      continue;
    }

    // Check subscription criteria
    if (
      !(await resourceMatchesSubscriptionCriteria({
        resource,
        subscription,
        logger,
        context: { interaction: interaction },
        getPreviousResource: async () => undefined,
      }))
    ) {
      continue;
    }

    // URL should be a Bot reference string
    const url = subscription.channel?.endpoint;
    if (!url?.startsWith('Bot/')) {
      // Skip if the URL is not a Bot reference
      continue;
    }

    const bot = await systemRepo.readReference<Bot>({ reference: url });
    const runAs = await findProjectMembership(project.id, createReference(bot));
    if (!runAs) {
      // Skip if the Bot is not in the project
      continue;
    }
    const headers: Record<string, string> = {};

    if (interaction === 'delete') {
      headers['X-Medplum-Deleted-Resource'] = `${resource.resourceType}/${resource.id}`;
    }

    const botResult = await executeBot({
      subscription,
      bot,
      runAs,
      input: resource,
      contentType: ContentType.FHIR_JSON,
      requestTime: new Date().toISOString(),
      headers: headers,
    });

    if (!botResult.success) {
      throw new OperationOutcomeError(normalizeOperationOutcome(botResult.returnValue));
    }

    return botResult.returnValue;
  }

  return undefined;
}
