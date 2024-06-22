import { ContentType, MedplumClient, isUUID } from '@medplum/core';
import { Agent, Bundle, OperationOutcome, Parameters, ParametersParameter, Reference } from '@medplum/fhirtypes';
import { createMedplumClient } from './util/client';
import { MedplumCommand, addSubcommand, withMergedOptions } from './utils';

type ValidIdsOrCriteria = { type: 'ids'; ids: string[] } | { type: 'criteria'; criteria: string };

const agentStatusCommand = new MedplumCommand('status').aliases(['info', 'list', 'ls']);
const agentPingCommand = new MedplumCommand('ping');
const agentPushCommand = new MedplumCommand('push');
// const agentReloadConfigCommand = new MedplumCommand('reload-config');
// const agentUpgradeCommand = new MedplumCommand('upgrade');

export const agent = new MedplumCommand('agent');
addSubcommand(agent, agentStatusCommand);
addSubcommand(agent, agentPingCommand);
addSubcommand(agent, agentPushCommand);
// addSubcommand(agent, agentReloadConfigCommand);
// addSubcommand(agent, agentUpgradeCommand);

agentStatusCommand
  .description('Get the status of a specified agent')
  .argument('[agentIds...]', 'The ID(s) of the agent(s) to get the status of')
  .option(
    '--criteria <criteria>',
    'An optional FHIR search criteria to resolve the agent to get the status of. Mutually exclusive with [agentIds...] arg'
  )
  .action(async (agentIds, options) => {
    const normalized = parseEitherIdsOrCriteria(agentIds, options);
    const medplum = await createMedplumClient(options);
    const usedCriteria = normalized.type === 'criteria' ? normalized.criteria : `Agent?_id=${normalized.ids.join(',')}`;
    const searchParams = new URLSearchParams(usedCriteria.split('?')[1]);

    let result: Bundle<Parameters> | Parameters | OperationOutcome;
    try {
      const url = medplum.fhirUrl('Agent', '$bulk-status');
      url.search = searchParams.toString();
      result = await medplum.get(url, {
        cache: 'reload',
      });
    } catch (_err) {
      throw new Error('Failed to get status from agent');
    }

    const successfulResponses = [] as AgentBulkOpResponse<Parameters>[];
    const failedResponses = [] as AgentBulkOpResponse<OperationOutcome>[];

    switch (result.resourceType) {
      case 'Bundle': {
        const responses = parseAgentBulkOpBundle(result);
        for (const response of responses) {
          if (response.result.resourceType === 'Parameters') {
            successfulResponses.push(response as AgentBulkOpResponse<Parameters>);
          } else {
            failedResponses.push(response as AgentBulkOpResponse<OperationOutcome>);
          }
        }
        break;
      }
      case 'Parameters':
      case 'OperationOutcome': {
        const agent = await medplum.searchOne('Agent', searchParams, { cache: 'reload' });
        if (!agent) {
          throw new Error('Agent not found');
        }
        if (result.resourceType === 'Parameters') {
          successfulResponses.push({ agent, result });
        } else {
          failedResponses.push({ agent, result });
        }
        break;
      }
      default:
        throw new Error(`Invalid result received for '$bulk-status' operation: ${JSON.stringify(result)}`);
    }

    const rows = [] as StatusRow[];
    for (const response of successfulResponses) {
      const statusEntry = parseParameterValues(response.result, {
        required: ['status', 'version'],
        optional: ['lastUpdated'],
      });
      const row = {
        id: response.agent.id as string,
        name: response.agent.name,
        enabledStatus: response.agent.status,
        version: statusEntry.version,
        connectionStatus: statusEntry.status,
        statusLastUpdated: statusEntry.lastUpdated ?? 'N/A',
      } satisfies StatusRow;
      rows.push(row);
    }

    console.table(rows);
  });

agentPingCommand
  .description('Ping a host from a specified agent')
  .argument('<ipOrDomain>', 'The IPv4 address or domain name to ping')
  .argument('[agentId]', 'The ID of the agent to ping from')
  .option('--count <count>', 'An optional amount of pings to issue before returning results', '1')
  .option(
    '--criteria <criteria>',
    'An optional FHIR search criteria to resolve the agent to ping from. Mutually exclusive with [agentId] arg'
  )
  .action(
    withMergedOptions(agentPingCommand, async (ipOrDomain, agentId, options) => {
      const medplum = await createMedplumClient(options);
      const agentRef = await resolveAgentReference(medplum, agentId, options);

      const count = Number.parseInt(options.count, 10);
      if (Number.isNaN(count)) {
        throw new Error('--count <count> must be an integer if specified');
      }

      let pingResult: string;
      try {
        pingResult = (await medplum.pushToAgent(
          agentRef,
          ipOrDomain,
          `PING ${count}`,
          ContentType.PING,
          true
        )) as string;
      } catch (err) {
        throw new Error('Unexpected response from agent while pinging', { cause: err });
      }

      console.log(pingResult);
    })
  );

agentPushCommand
  .description('Push a message to a target device via a specified agent')
  .argument('<deviceId>', 'The ID of the device to push the message to')
  .argument('<message>', 'The message to send to the destination device')
  .argument('[agentId]', 'The ID of the agent to tell to send the message to the device')
  .option('--content-type <contentType>', 'Tells the server what the content type of message is', ContentType.HL7_V2)
  .option('--no-wait', 'Tells the server not to wait for a response from the destination device')
  .option(
    '--criteria <criteria>',
    'An optional FHIR search criteria to resolve the agent to ping from. Mutually exclusive with [agentId] arg'
  )
  .action(async (deviceId, message, agentId, options) => {
    const medplum = await createMedplumClient(options);
    const agentRef = await resolveAgentReference(medplum, agentId, options);

    let pushResult: string;
    try {
      pushResult = (await medplum.pushToAgent(
        agentRef,
        { reference: `Device/${deviceId}` },
        message,
        options.contentType,
        !options.noWait
      )) as string;
    } catch (err) {
      throw new Error('Unexpected response from agent while pushing message to agent', { cause: err });
    }

    console.log(pushResult);
  });

export type StatusRow = {
  id: string;
  name: string;
  enabledStatus: string;
  connectionStatus: string;
  version: string;
  statusLastUpdated: string;
};

export async function resolveAgentReference(
  medplum: MedplumClient,
  agentId: string | undefined,
  options: Record<string, string>
): Promise<Reference<Agent>> {
  if (!(agentId || options.criteria)) {
    throw new Error('The `ping` command requires either an [agentId] or a --criteria <criteria> flag');
  }
  if (agentId && options.criteria) {
    throw new Error(
      'Ambiguous arguments and options combination; [agentId] arg and --criteria <criteria> flag are mutually exclusive'
    );
  }

  let usedId: string;
  if (agentId) {
    usedId = agentId;
  } else {
    assertValidAgentCriteria(options.criteria);
    const result = await medplum.search('Agent', `${options.criteria.split('?')[1]}&_count=2`);
    if (!result) {
      throw new Error('Could not find an agent matching the provided criteria');
    }
    usedId = result.id as string;
  }

  return { reference: `Agent/${usedId}` };
}

export type AgentBulkOpResponse<T extends Parameters | OperationOutcome = Parameters | OperationOutcome> = {
  agent: Agent;
  result: T;
};

export function parseAgentBulkOpBundle(bundle: Bundle<Parameters>): AgentBulkOpResponse[] {
  const responses = [];
  for (const entry of bundle.entry ?? []) {
    if (!entry.resource) {
      throw new Error('No Parameter resource found in entry');
    }
    responses.push(parseAgentBulkOpParameters(entry.resource));
  }
  return responses;
}

export function parseAgentBulkOpParameters(params: Parameters): AgentBulkOpResponse {
  const agent = params.parameter?.find((p) => p.name === 'agent')?.resource;
  if (!agent) {
    throw new Error("Agent bulk operation response missing 'agent'");
  }
  if (agent.resourceType !== 'Agent') {
    throw new Error(`Agent bulk operation returned 'agent' with type '${agent.resourceType}'`);
  }
  const result = params.parameter?.find((p) => p.name === 'result')?.resource;
  if (!result) {
    throw new Error("Agent bulk operation response missing result'");
  }
  if (!(result.resourceType === 'Parameters' || result.resourceType === 'OperationOutcome')) {
    throw new Error(`Agent bulk operation returned 'result' with type '${result.resourceType}'`);
  }
  return { agent, result };
}

export type ParsedParametersMap<R extends string[], O extends string[]> = Record<R[number], string> &
  Record<O[number], string | undefined>;

export type ParamNames<R extends string[], O extends string[] = []> = {
  required: R;
  optional?: O;
};

export function parseParameterValues<const R extends string[], const O extends string[] = []>(
  params: Parameters,
  paramNames: ParamNames<R, O>
): ParsedParametersMap<R, O> {
  const map = {} as ParsedParametersMap<R, O>;
  const requiredParams = paramNames.required;
  const optionalParams = paramNames.optional;

  for (const paramName of requiredParams) {
    const paramsParam = params.parameter?.find((p) => p.name === paramName);
    if (!paramsParam) {
      throw new Error(`Failed to find parameter '${paramName}'`);
    }
    let valueProp: string | undefined;
    for (const prop in paramsParam) {
      // This technically could lead to parsing invalid values (ie. valueAbc123) but for now we can pretend this always works
      if (prop.startsWith('value')) {
        if (valueProp) {
          throw new Error(`Found multiple values for parameter '${paramName}'`);
        }
        valueProp = prop;
      }
    }
    if (!valueProp) {
      throw new Error(`Failed to find a value for parameter '${paramName}'`);
    }

    // @ts-expect-error ParsedParameterMap expects key to be T[number], which it is, but unable to be inferred in for-of loop
    map[paramName] = paramsParam[valueProp] as string;
  }

  if (optionalParams?.length) {
    for (const paramName of optionalParams) {
      const paramsParam = params.parameter?.find((p) => p.name === paramName);
      if (!paramsParam) {
        continue;
      }
      const value = extractValueFromParametersParameter(paramName, paramsParam);
      // @ts-expect-error ParsedParameterMap expects key to be T[number], which it is, but unable to be inferred in for-of loop
      map[paramName] = value;
    }
  }

  return map;
}

export function extractValueFromParametersParameter(paramName: string, paramsParam: ParametersParameter): string {
  let valueProp: string | undefined;
  for (const prop in paramsParam) {
    // This technically could lead to parsing invalid values (ie. valueAbc123) but for now we can pretend this always works
    if (prop.startsWith('value')) {
      if (valueProp) {
        throw new Error(`Found multiple values for parameter '${paramName}'`);
      }
      valueProp = prop;
    }
  }
  if (!valueProp) {
    throw new Error(`Failed to find a value for parameter '${paramName}'`);
  }
  // @ts-expect-error valueProp is any string but it should only be choice-of-type `value[x]`
  return paramsParam[valueProp] as string;
}

export function parseEitherIdsOrCriteria(agentIds: string[], options: { criteria: string }): ValidIdsOrCriteria {
  if (!Array.isArray(agentIds)) {
    throw new Error('Invalid agent IDs array');
  }
  if (agentIds.length) {
    // Check that options.criteria is not defined
    if (options.criteria) {
      throw new Error(
        'Ambiguous arguments and options combination; [agentIds...] arg and --criteria <criteria> flag are mutually exclusive'
      );
    }
    for (const id of agentIds) {
      if (!isUUID(id)) {
        throw new Error(`Input '${id}' is not a valid agentId`);
      }
    }
    return { type: 'ids', ids: agentIds };
  }
  if (options.criteria) {
    assertValidAgentCriteria(options.criteria);
    return { type: 'criteria', criteria: options.criteria };
  }

  throw new Error('Either an [agentId...] arg or a --criteria <criteria> flag is required');
}

function assertValidAgentCriteria(criteria: string): void {
  const invalidCriteriaMsg =
    "Criteria must be formatted as a string containing the resource type (Agent) followed by a '?' and valid URL search query params, eg. `Agent?name=Test Agent`";
  if (typeof criteria !== 'string') {
    throw new Error(invalidCriteriaMsg);
  }
  const [resourceType, queryStr] = criteria.split('?');
  if (resourceType !== 'Agent') {
    throw new Error(invalidCriteriaMsg);
  }
  if (!queryStr) {
    throw new Error(invalidCriteriaMsg);
  }
  try {
    // eslint-disable-next-line no-new
    new URLSearchParams(queryStr);
  } catch (_err) {
    throw new Error(invalidCriteriaMsg);
  }
}
