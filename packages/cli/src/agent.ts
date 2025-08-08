// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, IssueSeverity, MedplumClient, MedplumClientOptions, WithId, isOk, isUUID } from '@medplum/core';
import { Agent, Bundle, OperationOutcome, Parameters, ParametersParameter, Reference } from '@medplum/fhirtypes';
import { Option } from 'commander';
import { createMedplumClient } from './util/client';
import { MedplumCommand, addSubcommand } from './utils';

export type ValidIdsOrCriteria = { type: 'ids'; ids: string[] } | { type: 'criteria'; criteria: string };

export type ParsedParametersMap<R extends string[], O extends string[]> = Record<R[number], string> &
  Record<O[number], string | undefined>;

export type ParamNames<R extends string[], O extends string[] = []> = {
  required: R;
  optional?: O;
};

export type AgentBulkOpResponse<T extends Parameters | OperationOutcome = Parameters | OperationOutcome> = {
  agent: WithId<Agent>;
  result: T;
};

export type CallAgentBulkOperationArgs<T extends Record<string, string>, R extends Parameters | OperationOutcome> = {
  operation: string;
  agentIds: string[];
  options: MedplumClientOptions & { criteria: string; output?: 'json' };
  params?: Record<string, string | boolean | number>;
  parseSuccessfulResponse: (response: AgentBulkOpResponse<R>) => T;
};

export type FailedRow = {
  id: string;
  name: string;
  severity: IssueSeverity;
  code: string;
  details: string;
};

export type StatusRow = {
  id: string;
  name: string;
  enabledStatus: string;
  connectionStatus: string;
  version: string;
  statusLastUpdated: string;
};

const agentStatusCommand = new MedplumCommand('status').aliases(['info', 'list', 'ls']);
const agentPingCommand = new MedplumCommand('ping');
const agentPushCommand = new MedplumCommand('push');
const agentReloadConfigCommand = new MedplumCommand('reload-config');
const agentUpgradeCommand = new MedplumCommand('upgrade');

export const agent = new MedplumCommand('agent');
addSubcommand(agent, agentStatusCommand);
addSubcommand(agent, agentPingCommand);
addSubcommand(agent, agentPushCommand);
addSubcommand(agent, agentReloadConfigCommand);
addSubcommand(agent, agentUpgradeCommand);

agentStatusCommand
  .description('Get the status of a specified agent')
  .argument('[agentIds...]', 'The ID(s) of the agent(s) to get the status of')
  .option(
    '--criteria <criteria>',
    'An optional FHIR search criteria to resolve the agent to get the status of. Mutually exclusive with [agentIds...] arg'
  )
  .addOption(
    new Option('--output <format>', 'An optional output format, defaults to table')
      .choices(['table', 'json'])
      .default('table')
  )
  .action(async (agentIds, options) => {
    await callAgentBulkOperation({
      operation: '$bulk-status',
      agentIds,
      options,
      parseSuccessfulResponse: (response: AgentBulkOpResponse<Parameters>) => {
        const statusEntry = parseParameterValues(response.result, {
          required: ['status', 'version'],
          optional: ['lastUpdated'],
        });

        return {
          id: response.agent.id,
          name: response.agent.name,
          enabledStatus: response.agent.status,
          version: statusEntry.version,
          connectionStatus: statusEntry.status,
          statusLastUpdated: statusEntry.lastUpdated ?? 'N/A',
        } satisfies StatusRow;
      },
    });
  });

agentPingCommand
  .description('Ping a host from a specified agent')
  .argument('<ipOrDomain>', 'The IPv4 address or domain name to ping')
  .argument(
    '[agentId]',
    'Conditionally optional ID of the agent to ping from. Mutually exclusive with --criteria <criteria> option'
  )
  .option('--count <count>', 'An optional amount of pings to issue before returning results', '1')
  .option(
    '--criteria <criteria>',
    'An optional FHIR search criteria to resolve the agent to ping from. Mutually exclusive with [agentId] arg'
  )
  .action(async (ipOrDomain, agentId, options) => {
    const medplum = await createMedplumClient(options);
    const agentRef = await resolveAgentReference(medplum, agentId, options);

    const count = Number.parseInt(options.count, 10);
    if (Number.isNaN(count)) {
      throw new Error('--count <count> must be an integer if specified');
    }

    try {
      const pingResult = (await medplum.pushToAgent(agentRef, ipOrDomain, `PING ${count}`, ContentType.PING, true, {
        maxRetries: 0,
      })) as string;
      console.info(pingResult);
    } catch (err) {
      throw new Error('Unexpected response from agent while pinging', { cause: err });
    }
  });

agentPushCommand
  .description('Push a message to a target device via a specified agent')
  .argument('<deviceId>', 'The ID of the device to push the message to')
  .argument('<message>', 'The message to send to the destination device')
  .argument(
    '[agentId]',
    'Conditionally optional ID of the agent to send the message from. Mutually exclusive with --criteria <criteria> option'
  )
  .option('--content-type <contentType>', 'The content type of the message', ContentType.HL7_V2)
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
        options.wait !== false,
        { maxRetries: 0 }
      )) as string;
    } catch (err) {
      throw new Error('Unexpected response from agent while pushing message to agent', { cause: err });
    }

    console.info(pushResult);
  });

agentReloadConfigCommand
  .description('Reload the config for the specified agent(s)')
  .argument(
    '[agentIds...]',
    'The ID(s) of the agent(s) for which the config should be reloaded. Mutually exclusive with --criteria <criteria> flag'
  )
  .option(
    '--criteria <criteria>',
    'An optional FHIR search criteria to resolve the agent(s) for which to notify to reload their config. Mutually exclusive with [agentIds...] arg'
  )
  .addOption(
    new Option('--output <format>', 'An optional output format, defaults to table')
      .choices(['table', 'json'])
      .default('table')
  )
  .action(async (agentIds, options) => {
    await callAgentBulkOperation({
      operation: '$reload-config',
      agentIds,
      options,
      parseSuccessfulResponse: (response: AgentBulkOpResponse<OperationOutcome>) => {
        return {
          id: response.agent.id,
          name: response.agent.name,
        };
      },
    });
  });

agentUpgradeCommand
  .description('Upgrade the version for the specified agent(s)')
  .argument(
    '[agentIds...]',
    'The ID(s) of the agent(s) that should be upgraded. Mutually exclusive with --criteria <criteria> flag'
  )
  .option(
    '--criteria <criteria>',
    'An optional FHIR search criteria to resolve the agent(s) to upgrade. Mutually exclusive with [agentIds...] arg'
  )
  .option(
    '--agentVersion <version>',
    'An optional agent version to upgrade to. Defaults to the latest version if flag not included'
  )
  .option('--force', 'Forces an upgrade when a pending upgrade is in an inconsistent state. Use with caution.')
  .addOption(
    new Option('--output <format>', 'An optional output format, defaults to table')
      .choices(['table', 'json'])
      .default('table')
  )
  .action(async (agentIds, options) => {
    const params: Record<string, string | boolean | number> = {};
    if (options.agentVersion) {
      params.version = options.agentVersion;
    }
    if (options.force) {
      params.force = true;
    }

    await callAgentBulkOperation({
      operation: '$upgrade',
      agentIds,
      options,
      params,
      parseSuccessfulResponse: (response: AgentBulkOpResponse<OperationOutcome>) => {
        return {
          id: response.agent.id,
          name: response.agent.name,
          version: options.agentVersion ?? 'latest',
        };
      },
    });
  });

export async function callAgentBulkOperation<
  T extends Record<string, string>,
  R extends Parameters | OperationOutcome,
>({
  operation,
  agentIds,
  options,
  params = {},
  parseSuccessfulResponse,
}: CallAgentBulkOperationArgs<T, R>): Promise<void> {
  const normalized = parseEitherIdsOrCriteria(agentIds, options);
  const medplum = await createMedplumClient(options);
  const usedCriteria = normalized.type === 'criteria' ? normalized.criteria : `Agent?_id=${normalized.ids.join(',')}`;
  const searchParams = new URLSearchParams(usedCriteria.split('?')[1]);
  for (const [paramName, paramVal] of Object.entries(params)) {
    searchParams.append(paramName, paramVal.toString());
  }

  let result: Bundle<Parameters> | Parameters | OperationOutcome;
  try {
    const url = medplum.fhirUrl('Agent', operation);
    url.search = searchParams.toString();
    result = await medplum.get(url, {
      cache: 'reload',
    });
  } catch (err) {
    throw new Error(`Operation '${operation}' failed`, { cause: err });
  }

  if (options.output === 'json') {
    console.info(JSON.stringify(result, null, 2));
    return;
  }

  const successfulResponses = [] as AgentBulkOpResponse<R>[];
  const failedResponses = [] as AgentBulkOpResponse<OperationOutcome>[];

  switch (result.resourceType) {
    case 'Bundle': {
      const responses = parseAgentBulkOpBundle(result);
      for (const response of responses) {
        if (response.result.resourceType === 'Parameters' || isOk(response.result)) {
          successfulResponses.push(response as AgentBulkOpResponse<R>);
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
        successfulResponses.push({ agent, result } as AgentBulkOpResponse<R>);
      } else {
        failedResponses.push({ agent, result });
      }
      break;
    }
    default:
      throw new Error(`Invalid result received for '${operation}' operation: ${JSON.stringify(result)}`);
  }

  const successfulRows = [] as T[];
  for (const response of successfulResponses) {
    const row = parseSuccessfulResponse(response);
    successfulRows.push(row);
  }

  const failedRows = [] as FailedRow[];
  for (const response of failedResponses) {
    const outcome = response.result;
    const issue = outcome.issue?.[0];
    const row = {
      id: response.agent.id,
      name: response.agent.name,
      severity: issue.severity,
      code: issue.code,
      details: issue.details?.text ?? 'No details to show',
    } satisfies FailedRow;
    failedRows.push(row);
  }

  console.info(`\n${successfulRows.length} successful response(s):\n`);
  console.table(successfulRows.length ? successfulRows : 'No successful responses received');
  console.info();

  if (failedRows.length) {
    console.info(`${failedRows.length} failed response(s):`);
    console.info();
    console.table(failedRows);
  }
}

export async function resolveAgentReference(
  medplum: MedplumClient,
  agentId: string | undefined,
  options: Record<string, string>
): Promise<Reference<Agent>> {
  if (!(agentId || options.criteria)) {
    throw new Error('This command requires either an [agentId] or a --criteria <criteria> flag');
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
    if (!result?.entry?.length) {
      throw new Error('Could not find an agent matching the provided criteria');
    }
    if (result.entry.length !== 1) {
      throw new Error(
        'Found more than one agent matching this criteria. This operation requires the criteria to resolve to exactly one agent'
      );
    }
    usedId = result.entry[0].resource?.id as string;
  }

  return { reference: `Agent/${usedId}` };
}

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
  const agent = params.parameter?.find((p) => p.name === 'agent')?.resource as WithId<Agent>;
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
  if (resourceType !== 'Agent' || !queryStr) {
    throw new Error(invalidCriteriaMsg);
  }
  try {
    // eslint-disable-next-line no-new
    new URLSearchParams(queryStr);
  } catch (err) {
    throw new Error(invalidCriteriaMsg, { cause: err });
  }
  if (!queryStr.includes('=')) {
    throw new Error(invalidCriteriaMsg, { cause: new Error('Query string lacks at least one `=`') });
  }
}
