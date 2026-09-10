// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  getExtension,
  isOperationOutcome,
  isResource,
  normalizeOperationOutcome,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bot, OperationDefinition, Reference, ResourceType } from '@medplum/fhirtypes';
import { executeBot } from '../../bots/execute';
import { getBotDefaultHeaders, getBotProjectMembership } from '../../bots/utils';
import { getAuthenticatedContext } from '../../context';
import type { Repository } from '../repo';
import { buildOutputParameters } from './utils/parameters';

const IMPLEMENTATION_EXTENSION_URL = 'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation';

const MAX_OPERATION_DEFINITIONS = 100;
const RESOURCE_MATCH_SCORE = 4;
const LEVEL_MATCH_SCORE = 2;
const PROJECT_MATCH_SCORE = 1;

type RequestTarget =
  | { level: 'system' }
  | { level: 'type'; resourceType: string }
  | { level: 'instance'; resourceType: string; resourceId: string };

interface CustomOperation {
  operation: WithId<OperationDefinition>;
  botReference: Reference<Bot>;
  score: number;
}

export async function tryCustomOperation(req: FhirRequest, repo: Repository): Promise<FhirResponse | undefined> {
  // Parse the URL to find the operation code
  const parts = req.url.split('/');
  const operationIndex = parts.findIndex((part) => part.startsWith('$'));
  if (operationIndex === -1) {
    // No operation found
    return undefined;
  }

  // The FHIR spec OperationDefinitions are shared with every project, so a custom operation can share its code
  // with a spec operation on another resource type (e.g. HealthcareService/$lookup and CodeSystem/$lookup).
  const operationCode = parts[operationIndex].substring(1); // Remove the '$' prefix
  const operations = await repo.searchResources<OperationDefinition>({
    resourceType: 'OperationDefinition',
    filters: [
      {
        code: 'code',
        operator: Operator.EXACT,
        value: operationCode,
      },
    ],
    count: MAX_OPERATION_DEFINITIONS,
  });

  const target = getRequestTarget(parts, operationIndex);
  const customOperation = selectCustomOperation(operations, target, repo.currentProject()?.id);
  if (!customOperation) {
    return undefined;
  }

  const { operation, botReference } = customOperation;
  const ctx = getAuthenticatedContext();

  // First read the bot as the user to verify access
  const userBot = await repo.readReference<Bot>(botReference);

  // Then read the bot as system user to load extended metadata
  const systemRepo = repo.getSystemRepo();
  const bot = await systemRepo.readResource<Bot>('Bot', userBot.id);

  // Determine the input for the bot
  // For instance-level operations (e.g., /Patient/123/$my-operation), read the resource and use it as input
  // For system-level or type-level operations, use the request body (POST) or query string (GET)
  let input: any;
  if (operation.instance && target.level === 'instance') {
    input = await repo.readResource(target.resourceType as ResourceType, target.resourceId);
  } else {
    input = req.method === 'POST' ? req.body : req.query;
  }

  // Execute the bot
  const result = await executeBot({
    bot,
    runAs: await getBotProjectMembership(ctx, bot),
    requester: ctx.membership.profile,
    input,
    contentType: req.headers?.['content-type'] as string,
    headers: req.headers,
    traceId: ctx.traceId,
    defaultHeaders: getBotDefaultHeaders(req, bot),
  });

  if (isOperationOutcome(result)) {
    return [result];
  }

  if (!result.success) {
    // On error, the return value is the OperationOutcome
    return [badRequest(result.logResult), result.returnValue];
  }

  if (isResource(result.returnValue, 'Parameters')) {
    return [allOk, result.returnValue];
  }

  try {
    // Note that buildOutputParameters will throw if the return value is invalid
    return [allOk, buildOutputParameters(operation, result.returnValue)];
  } catch (err) {
    return [normalizeOperationOutcome(err)];
  }
}

/**
 * Determines the level and resource type of the operation request from the URL parts,
 * e.g. ['', 'Patient', '123', '$op'] is instance-level, ['', 'Patient', '$op'] is type-level and ['', '$op'] is system-level.
 * @param parts - The request URL split by '/'.
 * @param operationIndex - The index of the '$operation' part.
 * @returns The request target.
 */
function getRequestTarget(parts: string[], operationIndex: number): RequestTarget {
  if (operationIndex >= 3 && parts[operationIndex - 2] && parts[operationIndex - 1]) {
    return { level: 'instance', resourceType: parts[operationIndex - 2], resourceId: parts[operationIndex - 1] };
  }
  if (operationIndex >= 2 && parts[operationIndex - 1]) {
    return { level: 'type', resourceType: parts[operationIndex - 1] };
  }
  return { level: 'system' };
}

/**
 * Selects the Bot-implemented OperationDefinition that best matches the request level and resource type,
 * preferring definitions in the current project over definitions shared from other projects.
 * @param operations - The OperationDefinitions with the requested code.
 * @param target - The request target.
 * @param projectId - The current project ID.
 * @returns The custom operation to execute, or undefined if none of the definitions is implemented by a Bot.
 */
function selectCustomOperation(
  operations: WithId<OperationDefinition>[],
  target: RequestTarget,
  projectId: string | undefined
): CustomOperation | undefined {
  let best: CustomOperation | undefined;
  for (const operation of operations) {
    const botReference = getBotReference(operation);
    if (!botReference) {
      continue;
    }
    const score = getMatchScore(operation, target, projectId);
    if (!best || score > best.score) {
      best = { operation, botReference, score };
    }
  }
  return best;
}

/**
 * Returns the Bot reference from the implementation extension of an OperationDefinition.
 * @param operation - The OperationDefinition.
 * @returns The Bot reference, or undefined if the definition does not have a Bot implementation.
 */
function getBotReference(operation: OperationDefinition): Reference<Bot> | undefined {
  const botReference = getExtension(operation, IMPLEMENTATION_EXTENSION_URL)?.valueReference;
  if (!botReference?.reference?.startsWith('Bot/')) {
    return undefined;
  }
  return botReference as Reference<Bot>;
}

/**
 * Scores how well an OperationDefinition matches the request.
 * A definition that does not match the request level or resource type is still a candidate,
 * so a lone definition keeps working when invoked at a different level than declared.
 * @param operation - The OperationDefinition.
 * @param target - The request target.
 * @param projectId - The current project ID.
 * @returns The match score; higher is better.
 */
function getMatchScore(operation: OperationDefinition, target: RequestTarget, projectId: string | undefined): number {
  let score = 0;
  if (target.level === 'system') {
    if (operation.system) {
      score += RESOURCE_MATCH_SCORE;
    }
  } else if (target.level === 'type' ? operation.type : operation.instance) {
    if (operation.resource?.includes(target.resourceType as ResourceType)) {
      score += RESOURCE_MATCH_SCORE;
    } else if (!operation.resource?.length) {
      score += LEVEL_MATCH_SCORE;
    }
  }
  if (projectId && operation.meta?.project === projectId) {
    score += PROJECT_MATCH_SCORE;
  }
  return score;
}
