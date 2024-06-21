import { ContentType, isUUID } from '@medplum/core';
import { Agent, Bundle, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { createMedplumClient } from './util/client';
import { MedplumCommand, addSubcommand } from './utils';

type ValidIdsOrCriteria = { type: 'ids'; ids: string[] } | { type: 'criteria'; criteria: string };

const agentStatusCommand = new MedplumCommand('status').aliases(['info', 'list', 'ls']);
const agentPingCommand = new MedplumCommand('ping');
// const agentPushCommand = new Command('push');
// const agentReloadConfigCommand = new Command('reload-config');
// const agentUpgradeCommand = new Command('upgrade');

export const agent = new MedplumCommand('agent');
addSubcommand(agent, agentStatusCommand);
addSubcommand(agent, agentPingCommand);
// addSubcommand(agent, agentStatusCommand);
// addSubcommand(agent, agentPushCommand);
// addSubcommand(agent, agentReloadConfigCommand);
// addSubcommand(agent, agentUpgradeCommand);

// .addCommand(agentPushCommand)
// .addCommand(agentStatusCommand);
// .addCommand(agentReloadConfigCommand)
// .addCommand(agentUpgradeCommand);

// agentPushCommand
//   .description('Push a message to the agent')
//   .argument('<botName>')
//   .option('--wait-for-response', 'Tells the server to wait for agent response before finalizing operation response')
//   .action(async (botName, options) => {
//     const medplum = await createMedplumClient(options);
//     await medplum.pushToAgent();
//   });

agentPingCommand
  .description('Ping a host from a specified agent')
  .argument('<ipOrDomain>', 'The IPv4 address or domain name to ping')
  .argument('[agentId]', 'The ID of the agent to ping from')
  .option('--count <count>', 'An optional amount of pings to issue before returning results', '1')
  .option(
    '--criteria <criteria>',
    'An optional FHIR search criteria to resolve the agent to ping from. Mutually exclusive with [agentId] arg'
  )
  .action(async (ipOrDomain, agentId, options) => {
    if (!(agentId || options.criteria)) {
      throw new Error('The `ping` command requires either an [agentId] or a --criteria <criteria> flag');
    }
    if (agentId && options.criteria) {
      throw new Error(
        'Ambiguous arguments and options combination; [agentId] arg and --criteria <criteria> flag are mutually exclusive'
      );
    }
    const count = Number.parseInt(options.count, 10);
    if (Number.isNaN(count)) {
      throw new Error('--count <count> must be an integer if specified');
    }

    const medplum = await createMedplumClient(options);
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

    let pingResult: string;
    try {
      pingResult = (await medplum.pushToAgent(
        { reference: `Agent/${usedId}` },
        ipOrDomain,
        `PING ${count}`,
        ContentType.PING,
        true
      )) as string;
    } catch (_err) {
      throw new Error('Unexpected response from agent while pinging');
    }

    console.log(pingResult);
  });

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
      const statusEntry = parseParameterValues(response.result, ['status', 'version', 'lastUpdated'], ['lastUpdated']);
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

export type StatusRow = {
  id: string;
  name: string;
  enabledStatus: string;
  connectionStatus: string;
  version: string;
  statusLastUpdated: string;
};

export type StatusEntry = {
  status: string;
  version: string;
  lastUpdated: string | undefined;
};

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

export type ParsedParametersMap<T extends string[], O extends T[number][] = []> = Record<
  Extract<T[number], O[number]>,
  string | undefined
> &
  Record<Exclude<T[number], Extract<T[number], O[number]>>, string>;

export function parseParameterValues<const T extends string[], const O extends T[number][] = []>(
  params: Parameters,
  paramNames: T,
  optionalParamNames?: O
): ParsedParametersMap<T, O> {
  const map = {} as ParsedParametersMap<T, O>;
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < paramNames.length; i++) {
    const paramsParam = params.parameter?.find((p) => p.name === paramNames[i]);
    if (!paramsParam) {
      if (optionalParamNames?.includes(paramNames[i])) {
        continue;
      }
      throw new Error(`Failed to find parameter '${paramNames[i]}'`);
    }
    let valueProp: string | undefined;
    for (const prop in paramsParam) {
      // This technically could lead to parsing invalid values (ie. valueAbc123) but for now we can pretend this always works
      if (prop.startsWith('value')) {
        if (valueProp) {
          throw new Error(`Found multiple values for parameter '${paramNames[i]}'`);
        }
        valueProp = prop;
      }
    }
    if (!valueProp) {
      throw new Error(`Failed to find a value for parameter '${paramNames[i]}'`);
    }

    // @ts-expect-error Not technically able to index ParametersParameter by "string"
    map[paramNames[i]] = paramsParam[valueProp] as string;
  }

  return map;
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
