// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobInteraction, InternalSchemaElement, WithId } from '@medplum/core';
import {
  badRequest,
  ContentType,
  createReference,
  flatMapFilter,
  getDataType,
  getExtension,
  getReferenceString,
  normalizeOperationOutcome,
  OperationOutcomeError,
  Operator,
  resourceMatchesSubscriptionCriteria,
} from '@medplum/core';
import type { Bot, Resource, ResourceType, Subscription } from '@medplum/fhirtypes';
import { executeBot } from '../bots/execute';
import { getConfig } from '../config/loader';
import { DatabaseMode } from '../database';
import { getLogger } from '../logger';
import { findProjectMembership } from '../workers/utils';
import type { Repository } from './repo';
import { getProjectSystemRepo } from './repo';
import { SelectQuery } from './sql';

export const PRE_COMMIT_SUBSCRIPTION_URL = 'https://medplum.com/fhir/StructureDefinition/pre-commit-bot';

export function isPreCommitSubscription(subscription: WithId<Subscription>): boolean {
  return getExtension(subscription, PRE_COMMIT_SUBSCRIPTION_URL)?.valueBoolean === true;
}

/**
 * Performs pre-commit validation for a resource by executing any associated pre-commit bots.
 * Throws an error if the bot execution fails.
 * @param repo - The user's FHIR repository.
 * @param resource  - The resource to validate.
 * @param interaction - The interaction type (e.g., 'create', 'update', 'delete').
 * @returns The validated resource if a pre-commit bot returns one, otherwise undefined.
 */
export async function preCommitValidation<T extends Resource>(
  repo: Repository,
  resource: WithId<T>,
  interaction: BackgroundJobInteraction
): Promise<T | boolean | undefined> {
  const logger = getLogger();

  if (
    interaction === 'delete' &&
    !repo.isSuperAdmin() &&
    getCriticalReferenceTargets().includes(resource.resourceType)
  ) {
    try {
      await checkReferencesForDelete(repo, resource);
    } catch (err) {
      logger.warn('Deleting resource referenced by ProjectMembership', err as Error);
    }
  }

  const project = repo.currentProject();

  // reject if the server does not have pre-commit enabled
  // or if the project does not have pre-commit enabled
  if (
    !getConfig().preCommitSubscriptionsEnabled ||
    !project?.setting?.find((s) => s.name === 'preCommitSubscriptionsEnabled')?.valueBoolean
  ) {
    return undefined;
  }

  resource.meta = { ...resource.meta, author: repo.getAuthor() };
  const systemRepo = await getProjectSystemRepo(project.id);
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

const criticalProjectMembershipReferences = ['profile', 'user', 'access-policy', 'accessPolicy'];
const targetPrefix = '/StructureDefinition/';

function getCriticalReferenceTargets(): ResourceType[] {
  const schema = getDataType('ProjectMembership');
  const targets = criticalProjectMembershipReferences.map((ref) => schema.elements[ref]);
  return flatMapFilter(targets, getTargetResourceTypes);
}

function getTargetResourceTypes(element: InternalSchemaElement | undefined): ResourceType[] {
  const types = element?.type ?? [];
  const targetTypes: ResourceType[] = [];
  for (const type of types) {
    const resourceTypes = type.targetProfile?.map((url) => url.slice(url.indexOf(targetPrefix) + targetPrefix.length));
    if (resourceTypes) {
      targetTypes.push(...(resourceTypes as ResourceType[]));
    }
  }
  return targetTypes;
}

/**
 * Ensures that critical references are not left dangling when a resource is deleted.
 * Specifically, resources referenced by a ProjectMembership should not be deleted until all memberships
 * that refer to them are deleted.
 * @param repo - The repository.
 * @param resource - The resource to be deleted.
 * @throws {OperationOutcomeError} When the resource cannot be deleted because of a critical reference.
 */
async function checkReferencesForDelete(repo: Repository, resource: WithId<Resource>): Promise<void> {
  const db = repo.getDatabaseClient(DatabaseMode.WRITER, 'ProjectMembership');
  const checkForCriticalRefs = new SelectQuery('ProjectMembership_References')
    .column('resourceId')
    .where('targetId', '=', resource.id)
    .where('code', 'IN', criticalProjectMembershipReferences)
    .limit(1);

  const results = await checkForCriticalRefs.execute(db);
  if (results.length) {
    throw new OperationOutcomeError(
      badRequest(
        `Cannot delete ${getReferenceString(resource)}: referenced by ProjectMembership/${results[0].resourceId}`
      )
    );
  }
}
