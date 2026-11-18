// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { OperationDefinition, OperationDefinitionParameter, Parameters } from '@medplum/fhirtypes';
import { BOT_IDENTIFIER_VALUE } from './constants';

const param = (name: string, type: string, min = 0, max = '1'): OperationDefinitionParameter => ({
  name,
  type: type,
  min,
  max,
  use: 'in',
  documentation: name,
});
const summary = [
  param('connected', 'boolean', 1),
  param('status', 'code'),
  param('email', 'string'),
  param('eventDetailLevel', 'code'),
  param('effectiveDetailLevel', 'code'),
  param('privacyCleanupPending', 'boolean'),
  param('outboundPending', 'boolean'),
  param('inboundPending', 'boolean'),
  param('stale', 'boolean'),
  param('staleReason', 'code'),
  param('lastSuccessfulInbound', 'instant'),
  param('lastSuccessfulOutbound', 'instant'),
  param('disconnectWarning', 'string'),
];
const entries = [
  [
    'install',
    BOT_IDENTIFIER_VALUE.install,
    [],
    [param('installed', 'boolean', 1), param('outcome', 'OperationOutcome', 1)],
  ],
  [
    'connect',
    BOT_IDENTIFIER_VALUE.connect,
    [
      param('code', 'string', 1),
      param('codeVerifier', 'string', 1),
      param('redirectUri', 'string', 1),
      param('eventDetailLevel', 'string'),
    ],
    summary,
  ],
  [
    'status',
    BOT_IDENTIFIER_VALUE.status,
    [],
    [...summary, param('clientId', 'string'), param('detailsAllowed', 'boolean')],
  ],
  ['settings', BOT_IDENTIFIER_VALUE.settings, [param('eventDetailLevel', 'string', 1)], summary],
  ['disconnect', BOT_IDENTIFIER_VALUE.disconnect, [param('forgetRevoked', 'boolean')], summary],
] as const;

function output(p: OperationDefinitionParameter): OperationDefinitionParameter {
  return { ...p, use: 'out', ...(p.part ? { part: p.part.map(output) } : {}) };
}
export const CONTRACTS: Record<string, { definition: OperationDefinition; botIdentifier: string }> = Object.fromEntries(
  entries.map(([name, botIdentifier, inputs, outputs]) => [
    name,
    {
      botIdentifier,
      definition: {
        resourceType: 'OperationDefinition',
        url: `https://medplum.com/fhir/OperationDefinition/google-calendar-${name}`,
        name: `GoogleCalendar${name[0].toUpperCase()}${name.slice(1)}`,
        title: `Google Calendar ${name}`,
        status: 'active',
        kind: 'operation',
        code: `google-calendar-${name}`,
        system: false,
        type: true,
        instance: false,
        affectsState: name !== 'status',
        resource: [name === 'install' ? 'Project' : 'Practitioner'],
        description: operationDescription(name),
        parameter: [...inputs, ...outputs.map(output)],
      },
    },
  ])
);

/**
 * Checks a request body against the operation's input parameters. Each handler validates values.
 * @param name - The operation.
 * @param value - The request body; an absent body is an empty `Parameters`.
 * @returns The validated body.
 */
export function validateInput(name: string, value: unknown): Parameters {
  const input = (value ?? { resourceType: 'Parameters' }) as Parameters;
  if (input.resourceType !== 'Parameters' || (input.parameter !== undefined && !Array.isArray(input.parameter))) {
    throw new Error('Operation requires a FHIR Parameters resource');
  }
  const definitions = CONTRACTS[name].definition.parameter?.filter((p) => p.use === 'in') ?? [];
  for (const p of input.parameter ?? []) {
    const d = definitions.find((d) => d.name === p.name);
    if (!d) {
      throw new Error(`Unknown parameter: ${p.name}`);
    }
    const valid = d.type === 'boolean' ? typeof p.valueBoolean === 'boolean' : Boolean(p.valueString?.trim());
    if (!valid) {
      throw new Error(`Empty or invalid parameter: ${p.name}`);
    }
  }
  for (const d of definitions) {
    const n = input.parameter?.filter((p) => p.name === d.name).length ?? 0;
    if (n < d.min || n > Number(d.max)) {
      throw new Error(`Required parameters missing or repeated: ${d.name}`);
    }
  }
  return input;
}

export function operationHandler(
  name: string,
  execute: (medplum: MedplumClient, event: BotEvent<Parameters>) => Promise<Parameters>
): (medplum: MedplumClient, event: BotEvent<Parameters | undefined>) => Promise<Parameters> {
  return async (medplum, event) => execute(medplum, { ...event, input: validateInput(name, event.input) });
}

function operationDescription(name: string): string {
  if (name === 'status') {
    return 'Read caller-authorized connection status.';
  }
  if (name === 'disconnect') {
    return 'Queue cleanup of both sides; completion is reported by status.';
  }
  return `Configure Google Calendar ${name}.`;
}
