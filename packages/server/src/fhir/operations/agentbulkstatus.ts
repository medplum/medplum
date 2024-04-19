import { allOk, badRequest, isOk, serverError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Agent, Bundle, BundleEntry, OperationDefinition, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { agentStatusHandler } from './agentstatus';
import { getAgentsForRequest } from './agentutils';

export const MAX_AGENTS_PER_PAGE = 100;

export const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'agent-bulk-status',
  status: 'active',
  kind: 'operation',
  code: 'bulk-status',
  experimental: true,
  resource: ['Agent'],
  system: false,
  type: true,
  instance: false,
  parameter: [{ use: 'out', name: 'return', type: 'Bundle', min: 1, max: '1' }],
};

/**
 * Handles HTTP requests for the Agent $status operation.
 * First reads the agent and makes sure it is valid and the user has access to it.
 * Then tries to get the agent status from Redis.
 * Returns the agent status details as a Parameters resource.
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function agentBulkStatusHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();

  if (req.query._count && Number.parseInt(req.query._count, 10) > MAX_AGENTS_PER_PAGE) {
    return [badRequest(`'_count' of ${req.query._count} is greater than max of ${MAX_AGENTS_PER_PAGE}`)];
  }

  const agents = await getAgentsForRequest(req, repo);
  if (!agents?.length) {
    return [badRequest('No agent(s) for given query')];
  }

  const promises = agents.map((agent) => agentStatusHandler({ ...req, params: { id: agent.id as string } }));
  const results = await Promise.allSettled(promises);
  const entries = [] as BundleEntry<Parameters>[];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      entries.push(makeResultWrapperEntry(serverError(result.reason as Error), agents[i]));
      continue;
    }
    const [outcome, params] = result.value;
    if (!isOk(outcome)) {
      entries.push(makeResultWrapperEntry(outcome, agents[i]));
      continue;
    }
    entries.push(makeResultWrapperEntry(params as Parameters, agents[i]));
  }

  return [
    allOk,
    {
      resourceType: 'Bundle',
      type: 'collection',
      entry: entries,
    } satisfies Bundle<Parameters>,
  ];
}

function makeResultWrapperEntry(result: Parameters | OperationOutcome, agent: Agent): BundleEntry<Parameters> {
  return {
    resource: {
      resourceType: 'Parameters',
      parameter: [
        { name: 'agent', resource: agent },
        { name: 'result', resource: result },
      ],
    },
  };
}
