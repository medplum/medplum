import { ContentType } from '@medplum/core';
import { Command } from 'commander';
import { createMedplumClient } from './util/client';
import { createMedplumCommand } from './util/command';

// const agentPushCommand = createMedplumCommand('push');
const agentPingCommand = createMedplumCommand('ping');
// const agentStatusCommand = createMedplumCommand('status');
// const agentReloadConfigCommand = createMedplumCommand('reload-config');
// const agentUpgradeCommand = createMedplumCommand('upgrade');

export const agent = new Command('agent')
  // .addCommand(agentPushCommand)
  .addCommand(agentPingCommand);
// .addCommand(agentStatusCommand)
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
    'An optional FHIR search criteria to resolve the Agent to ping from. Mutually exclusive with [agentId] arg'
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
      const result = await medplum.searchOne('Agent', options.criteria.split('?')[1]);
      if (!result) {
        throw new Error('Could not find Agent matching the provided criteria');
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
