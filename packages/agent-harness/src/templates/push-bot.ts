// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Agent, Bot, Endpoint } from '@medplum/fhirtypes';
import type { AgentMaterialization, AgentNodeSpec, AgentTemplate, TemplateContext } from '../types';

/**
 * push-bot template
 *
 * Produces an Agent that:
 *   - listens on a TCP HL7 channel (enhancedMode aaMode + keepAlive by default)
 *   - on each inbound message, invokes a Bot that calls Agent/$push to forward
 *     the message to a downstream agent's channel
 *
 * Inputs:
 *   - listenPort: number  (required)
 *   - forwardToNodeId: string  (required — id of another node in the scenario)
 *   - forwardToChannelName?: string  (optional — defaults to 'hl7-in')
 *   - enhancedMode?: 'standard' | 'aaMode' | undefined (default 'aaMode')
 *   - keepAlive?: boolean (default true)
 *   - channelName?: string (default 'hl7-in')
 */
export const pushBotTemplate: AgentTemplate = {
  name: 'push-bot',
  description:
    'Agent with one HL7 inbound channel that pushes received messages to another agent via Agent/$push (enhanced AA ACK + keepAlive by default).',
  materialize(node: AgentNodeSpec, ctx: TemplateContext): AgentMaterialization {
    const inputs = parseInputs(node, ctx);
    const agentId = ctx.resourceId(node.id, 'agent');
    const endpointId = ctx.resourceId(node.id, 'endpoint');
    const botId = ctx.resourceId(node.id, 'bot');
    const forwardAgentId = ctx.resourceId(inputs.forwardToNodeId, 'agent');

    const endpoint: Endpoint = {
      resourceType: 'Endpoint',
      id: endpointId,
      status: 'active',
      connectionType: { system: 'http://hl7.org/fhir/endpoint-connection-type', code: 'hl7v2-mllp' },
      payloadType: [{ coding: [{ code: 'any' }] }],
      address: `mllp://0.0.0.0:${inputs.listenPort}`,
    };

    const bot: Bot = {
      resourceType: 'Bot',
      id: botId,
      name: `${node.id}-push-bot`,
      runtimeVersion: 'awslambda',
      code: buildPushBotCode({
        forwardAgentRef: `Agent/${forwardAgentId}`,
        forwardChannelName: inputs.forwardToChannelName,
      }),
    };

    const agent: Agent = {
      resourceType: 'Agent',
      id: agentId,
      name: node.label ?? node.id,
      status: 'active',
      channel: [
        {
          name: inputs.channelName,
          endpoint: { reference: `Endpoint/${endpointId}` },
          targetReference: { reference: `Bot/${botId}` },
        },
      ],
      setting: [
        { name: 'enhancedMode', valueString: inputs.enhancedMode ?? 'aaMode' },
        { name: 'keepAlive', valueBoolean: inputs.keepAlive },
      ],
    };

    return { agent, endpoints: [endpoint], bot };
  },
};

interface ParsedInputs {
  listenPort: number;
  forwardToNodeId: string;
  forwardToChannelName: string;
  channelName: string;
  enhancedMode: 'standard' | 'aaMode';
  keepAlive: boolean;
}

function parseInputs(node: AgentNodeSpec, ctx: TemplateContext): ParsedInputs {
  const raw = node.inputs ?? {};
  const listenPort = num(raw.listenPort, 'listenPort');
  const forwardToNodeId = str(raw.forwardToNodeId, 'forwardToNodeId');
  if (!ctx.scenario.nodes.find((n) => n.id === forwardToNodeId)) {
    throw new Error(`push-bot[${node.id}]: forwardToNodeId '${forwardToNodeId}' is not a node in the scenario`);
  }
  return {
    listenPort,
    forwardToNodeId,
    forwardToChannelName: (raw.forwardToChannelName as string) ?? 'hl7-in',
    channelName: (raw.channelName as string) ?? 'hl7-in',
    enhancedMode: (raw.enhancedMode as 'standard' | 'aaMode') ?? 'aaMode',
    keepAlive: raw.keepAlive === undefined ? true : Boolean(raw.keepAlive),
  };
}

function num(v: unknown, key: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`push-bot template input '${key}' must be a number, got ${typeof v}`);
  }
  return v;
}

function str(v: unknown, key: string): string {
  if (typeof v !== 'string' || !v) {
    throw new Error(`push-bot template input '${key}' must be a non-empty string`);
  }
  return v;
}

function buildPushBotCode(opts: { forwardAgentRef: string; forwardChannelName: string }): string {
  return [
    "import { BotEvent, MedplumClient } from '@medplum/core';",
    '',
    'export async function handler(medplum: MedplumClient, event: BotEvent<string>): Promise<unknown> {',
    `  return medplum.pushToAgent({ reference: '${opts.forwardAgentRef}' }, '${opts.forwardChannelName}', event.input, 'x-application/hl7-v2+er7', true);`,
    '}',
    '',
  ].join('\n');
}
