import { Operator, parseSearchRequest } from '@medplum/core';
import { Agent, Device } from '@medplum/fhirtypes';
import { Request } from 'express';
import { isIPv4 } from 'node:net';
import { Repository } from '../repo';

/**
 * Returns the Agent for a request.
 *
 * All Agent operations support lookup by ID or identifier.
 *
 * For example:
 *
 * If using "/Agent/:id/$push", then the agent ID is read from the path parameter.
 * If using "/Agent/$push?identifier=...", then the agent is searched by identifier.
 * Otherwise, returns undefined.
 *
 * @param req - The HTTP request.
 * @param repo - The repository.
 * @returns The agent, or undefined if not found.
 */
export async function getAgentForRequest(req: Request, repo: Repository): Promise<Agent | undefined> {
  // Prefer to search by ID from path parameter
  const { id } = req.params;
  if (id) {
    return repo.readResource<Agent>('Agent', id);
  }

  // Otherwise, search by identifier
  const { identifier } = req.query;
  if (identifier && typeof identifier === 'string') {
    return repo.searchOne<Agent>({
      resourceType: 'Agent',
      filters: [{ code: 'identifier', operator: Operator.EXACT, value: identifier }],
    });
  }

  // If no agent ID or identifier, return undefined
  return undefined;
}

export async function getDevice(repo: Repository, destination: string): Promise<Device | undefined> {
  if (destination.startsWith('Device/')) {
    try {
      return await repo.readReference<Device>({ reference: destination });
    } catch (_err) {
      return undefined;
    }
  }
  if (destination.startsWith('Device?')) {
    return repo.searchOne<Device>(parseSearchRequest(destination));
  }
  if (isIPv4(destination)) {
    return { resourceType: 'Device', url: destination };
  }
  return undefined;
}
