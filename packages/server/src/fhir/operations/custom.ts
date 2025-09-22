// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, getExtension, isOperationOutcome, Operator } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Bot, OperationDefinition, Reference } from '@medplum/fhirtypes';
import { executeBot } from '../../bots/execute';
import { getBotDefaultHeaders, getBotProjectMembership } from '../../bots/utils';
import { getAuthenticatedContext } from '../../context';
import { getSystemRepo, Repository } from '../repo';
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
  const systemRepo = getSystemRepo();
  const bot = await systemRepo.readResource<Bot>('Bot', userBot.id);

  // Execute the bot
  // If the request is HTTP POST, then the body is the input
  // If the request is HTTP GET, then the query string is the input
  const result = await executeBot({
    bot,
    runAs: await getBotProjectMembership(ctx, bot),
    requester: ctx.membership.profile,
    input: req.method === 'POST' ? req.body : req.query,
    contentType: req.headers?.['content-type'] as string,
    headers: req.headers,
    traceId: ctx.traceId,
    defaultHeaders: getBotDefaultHeaders(req, bot),
  });

  if (isOperationOutcome(result)) {
    return [result];
  }

  const outcome = result.success ? allOk : badRequest(result.logResult);
  return [outcome, buildOutputParameters(operation, result.returnValue)];
}
