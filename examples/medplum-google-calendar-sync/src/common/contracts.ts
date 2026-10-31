// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type {
  OperationDefinition,
  OperationDefinitionParameter,
  Parameters,
  ParametersParameter,
} from '@medplum/fhirtypes';
import { BOT_IDENTIFIER_VALUE, EVENT_DETAIL_LEVELS, SECRET } from './constants';

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
const conflict = {
  ...param('conflict', 'string', 0, '*'),
  type: undefined,
  part: [
    param('key', 'string', 1),
    param('appointment', 'Reference', 1),
    param('start', 'instant', 1),
    param('end', 'instant', 1),
    param('schedule', 'Reference', 0, '*'),
  ],
};
const entries = [
  [
    'install',
    BOT_IDENTIFIER_VALUE.install,
    [
      param(SECRET.clientId, 'string', 1),
      param(SECRET.clientSecret, 'string', 1),
      param(SECRET.appointmentUrl, 'string'),
      param(SECRET.detailLevel, 'string'),
    ],
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
  ['status', BOT_IDENTIFIER_VALUE.status, [], [...summary, param('activeConflictCount', 'integer'), conflict]],
  ['settings', BOT_IDENTIFIER_VALUE.settings, [param('eventDetailLevel', 'string', 1)], summary],
  ['disconnect', BOT_IDENTIFIER_VALUE.disconnect, [param('forgetRevoked', 'boolean')], summary],
  [
    'sync',
    BOT_IDENTIFIER_VALUE.syncRange,
    [param('start', 'string'), param('end', 'string')],
    [param('queued', 'boolean', 1), param('start', 'dateTime', 1), param('end', 'dateTime', 1)],
  ],
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

function validateParts(actual: ParametersParameter[], definitions: OperationDefinitionParameter[]): void {
  for (const p of actual) {
    const d = definitions.find((d) => d.name === p.name);
    if (!d) {
      throw new Error(`Unknown parameter: ${p.name}`);
    }
    const keys = Object.keys(p).filter((k) => k.startsWith('value') || k === 'resource' || k === 'part');
    let key = `value${d.type?.[0].toUpperCase()}${d.type?.slice(1)}`;
    if (d.part) {
      key = 'part';
    } else if (d.type && /^[A-Z]/.test(d.type) && d.type !== 'Reference') {
      key = 'resource';
    }
    if (keys.length !== 1 || keys[0] !== key) {
      throw new Error(`Invalid type for parameter: ${p.name}`);
    }
    const value = (p as unknown as Record<string, unknown>)[key];
    if (d.part) {
      if (!Array.isArray(p.part)) {
        throw new Error('Invalid parameter parts');
      }
      validateParts(p.part, d.part);
    } else if (key === 'resource') {
      if (p.resource?.resourceType !== d.type) {
        throw new Error(`Invalid resource: ${p.name}`);
      }
    } else if (d.type === 'Reference') {
      if (typeof p.valueReference?.reference !== 'string') {
        throw new Error(`Invalid reference: ${p.name}`);
      }
    } else if (d.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new Error(`Invalid boolean: ${p.name}`);
      }
    } else if (d.type === 'integer') {
      if (!Number.isInteger(value) || Number(value) < 0) {
        throw new Error(`Invalid integer: ${p.name}`);
      }
    } else if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Empty or invalid parameter: ${p.name}`);
    }
    if (
      ['eventDetailLevel', 'effectiveDetailLevel', SECRET.detailLevel].includes(p.name) &&
      !EVENT_DETAIL_LEVELS.includes(value as (typeof EVENT_DETAIL_LEVELS)[number])
    ) {
      throw new Error(`eventDetailLevel must be one of ${EVENT_DETAIL_LEVELS.join(', ')}`);
    }
    if (['instant', 'dateTime'].includes(d.type ?? '') && !Number.isFinite(Date.parse(String(value)))) {
      throw new Error(`Invalid date: ${p.name}`);
    }
  }
  for (const d of definitions) {
    const n = actual.filter((p) => p.name === d.name).length;
    if (n < d.min || (d.max !== '*' && n > Number(d.max))) {
      throw new Error(`Required parameters missing or repeated: ${d.name}`);
    }
  }
}
export function validateContract(name: string, direction: 'in' | 'out', value: unknown): void {
  if (value === undefined && direction === 'in') {
    value = { resourceType: 'Parameters' };
  }
  const resource = value as Parameters | undefined;
  if (
    resource?.resourceType !== 'Parameters' ||
    (resource.parameter !== undefined && !Array.isArray(resource.parameter))
  ) {
    throw new Error('Operation requires a FHIR Parameters resource');
  }
  validateParts(
    resource.parameter ?? [],
    CONTRACTS[name].definition.parameter?.filter((p) => p.use === direction) ?? []
  );
}
export function operationHandler(
  name: string,
  execute: (medplum: MedplumClient, event: BotEvent<Parameters>) => Promise<Parameters>
): (medplum: MedplumClient, event: BotEvent<Parameters | undefined>) => Promise<Parameters> {
  return async (medplum, event) => {
    validateContract(name, 'in', event.input);
    const result = await execute(medplum, { ...event, input: event.input ?? { resourceType: 'Parameters' } });
    validateContract(name, 'out', result);
    return result;
  };
}

function operationDescription(name: string): string {
  if (name === 'status') {
    return 'Read caller-authorized connection status and conflicts.';
  }
  if (name === 'sync') {
    return 'Queue outbound work; completion is reported by status.';
  }
  if (name === 'disconnect') {
    return 'Queue cleanup of both sides; completion is reported by status.';
  }
  return `Configure Google Calendar ${name}.`;
}
