// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  getExtension,
  isOperationOutcome,
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

export async function tryCustomOperation(req: FhirRequest, repo: Repository): Promise<FhirResponse | undefined> {
  // Parse the URL to find the operation code
  const parts = req.url.split('/');
  const operationPart = parts.find((part) => part.startsWith('$'));
  if (!operationPart) {
    // No operation found
    return undefined;
  }

  // Search for the OperationDefinition resource
  const operationCode = operationPart.substring(1); // Remove the '$' prefix
  const operation = await repo.searchOne<OperationDefinition>({
    resourceType: 'OperationDefinition',
    filters: [
      {
        code: 'code',
        operator: Operator.EXACT,
        value: operationCode,
      },
    ],
  });
  if (!operation) {
    // No operation definition found
    return undefined;
  }

  // Check if the operation is a custom operation
  const extension = getExtension(
    operation,
    'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation'
  );
  if (!extension) {
    // No implementation extension found
    return undefined;
  }

  // Check if the extension is a Bot reference
  const botReference = extension.valueReference;
  if (!botReference?.reference?.startsWith('Bot/')) {
    // Not a Bot reference
    return undefined;
  }

  const ctx = getAuthenticatedContext();

  // First read the bot as the user to verify access
  const userBot = await repo.readReference<Bot>(botReference as Reference<Bot>);

  // Then read the bot as system user to load extended metadata
  const systemRepo = repo.getSystemRepo();
  const bot = await systemRepo.readResource<Bot>('Bot', userBot.id);

  // Determine the input for the bot
  // For instance-level operations (e.g., /Patient/123/$my-operation), read the resource and use it as input
  // For system-level or type-level operations, use the request body (POST) or query string (GET)
  const operationIndex = parts.indexOf(operationPart);
  let input: any;
  if (operation.instance && operationIndex >= 3 && parts[operationIndex - 2] && parts[operationIndex - 1]) {
    const resourceType = parts[operationIndex - 2] as ResourceType;
    const resourceId = parts[operationIndex - 1];
    input = await repo.readResource(resourceType, resourceId);
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

  try {
    // Note that buildOutputParameters will throw if the return value is invalid
    return [allOk, buildOutputParameters(operation, result.returnValue)];
  } catch (err) {
    return [normalizeOperationOutcome(err)];
  }
}
