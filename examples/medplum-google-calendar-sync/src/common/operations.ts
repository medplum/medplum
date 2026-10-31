// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Shared pieces of the practitioner-facing operations (`Practitioner/$google-calendar-*`).
 * They are type-level operations (an instance-level custom operation would receive the
 * resource instead of the request body), and the practitioner is always `event.requester`,
 * which the server sets to the caller's own profile. Nobody can act on someone else's calendar.
 */

import type { BotEvent, MedplumClient } from '@medplum/core';
import { getStatus, OperationOutcomeError } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import type { EventDetailLevel } from './constants';
import { EVENT_DETAIL_LEVELS } from './constants';
import type { CalendarConnection } from './connection';
import { readProjectCeiling } from './configuration';
import { resolveDetailLevel } from './mapping';
import type { CalendarConflict } from './import';
import { readState } from './state';
import { createHash } from 'node:crypto';

/**
 * The calling practitioner. Only a Practitioner may hold a Calendar Connection.
 * @param event - The Bot event.
 * @returns `Practitioner/<id>`.
 */
export function requirePractitionerRequester(event: BotEvent): string {
  const reference = event.requester?.reference;
  if (!reference?.startsWith('Practitioner/')) {
    throw new Error('Only a Practitioner can manage a Google Calendar connection');
  }
  return reference;
}

/**
 * A string parameter from the operation input.
 * @param input - The `Parameters` body.
 * @param name - The parameter name.
 * @returns The value, or undefined.
 */
export function getParam(input: Parameters | undefined, name: string): string | undefined {
  const value = input?.parameter?.find((p) => p.name === name)?.valueString?.trim();
  return value || undefined;
}

/**
 * Validates an optional `eventDetailLevel` parameter.
 * @param value - The raw parameter.
 * @returns The level, or undefined when absent.
 */
export function parseDetailLevel(value: string | undefined): EventDetailLevel | undefined {
  if (!value) {
    return undefined;
  }
  const level = EVENT_DETAIL_LEVELS.find((l) => l === value);
  if (!level) {
    throw new Error(`eventDetailLevel must be one of ${EVENT_DETAIL_LEVELS.join(', ')}`);
  }
  return level;
}

/**
 * The `Parameters` every operation returns, so the settings UI renders one shape.
 * @param connection - The connection, if any.
 * @param ceiling - Current project detail ceiling.
 * @param conflicts - Conflicts filtered through the caller’s resource permissions.
 * @returns `connected`, and the account email and detail level when connected.
 */
export function connectionStatusParameters(
  connection: CalendarConnection | undefined,
  ceiling?: string,
  conflicts: CalendarConflict[] = []
): Parameters {
  const parameter: ParametersParameter[] = [{ name: 'connected', valueBoolean: connection !== undefined }];
  if (connection) {
    const state = readState(connection.basic);
    let overdue: string | undefined;
    if (!state.lastInbound) {
      overdue = 'awaiting-initial-import';
    } else if (Date.now() - Date.parse(state.lastInbound) > 2 * 60 * 60_000) {
      overdue = 'import-overdue';
    }
    const staleReason =
      state.cleanupIssue ??
      state.inboundError ??
      state.outboundError ??
      state.staleReason ??
      (connection.status !== 'active' ? connection.status : undefined) ??
      overdue;
    parameter.push(
      { name: 'status', valueCode: connection.status },
      {
        name: 'effectiveDetailLevel',
        valueCode: resolveDetailLevel(ceiling ?? state.projectDetailLevel, connection.eventDetailLevel),
      },
      { name: 'privacyCleanupPending', valueBoolean: state.privacyPending === true },
      {
        name: 'outboundPending',
        valueBoolean: Boolean(state.outboundWork) || state.outboundRequest !== state.outboundCompleted,
      },
      { name: 'inboundPending', valueBoolean: state.inboundRequest !== state.inboundCompleted },
      { name: 'stale', valueBoolean: Boolean(staleReason) },
      { name: 'activeConflictCount', valueInteger: conflicts.length },
      {
        name: 'disconnectWarning',
        valueString:
          'Disconnect removes imported Google busy Slots. That time becomes bookable subject to other scheduling constraints.',
      }
    );
    if (staleReason) {
      parameter.push({ name: 'staleReason', valueCode: staleReason });
    }
    if (state.lastInbound) {
      parameter.push({ name: 'lastSuccessfulInbound', valueInstant: state.lastInbound });
    }
    if (state.lastOutbound) {
      parameter.push({ name: 'lastSuccessfulOutbound', valueInstant: state.lastOutbound });
    }
    for (const conflict of conflicts) {
      parameter.push({
        name: 'conflict',
        part: [
          { name: 'key', valueString: conflict.key },
          { name: 'appointment', valueReference: { reference: conflict.appointment } },
          { name: 'start', valueInstant: conflict.start },
          { name: 'end', valueInstant: conflict.end },
          ...conflict.schedules.map((reference) => ({ name: 'schedule', valueReference: { reference } })),
        ],
      });
    }
    if (connection.accountEmail) {
      parameter.push({ name: 'email', valueString: connection.accountEmail });
    }
    if (connection.eventDetailLevel) {
      parameter.push({ name: 'eventDetailLevel', valueCode: connection.eventDetailLevel });
    }
  }
  return { resourceType: 'Parameters', parameter };
}

export async function authorizedStatus(
  medplum: MedplumClient,
  connection: CalendarConnection | undefined,
  fallbackCeiling?: string
): Promise<Parameters> {
  if (!connection) {
    return connectionStatusParameters(undefined);
  }
  const conflicts: CalendarConflict[] = [];
  const readable = async (reference: string): Promise<boolean> => {
    try {
      await medplum.readReference({ reference }, { cache: 'no-cache' });
      return true;
    } catch (err) {
      if (err instanceof OperationOutcomeError && [403, 404, 410].includes(getStatus(err.outcome))) {
        return false;
      }
      throw err;
    }
  };
  for (const conflict of readState(connection.basic).conflicts) {
    if (!/^Appointment\/[A-Za-z0-9.-]+$/.test(conflict.appointment) || !(await readable(conflict.appointment))) {
      continue;
    }
    const schedules: string[] = [];
    for (const ref of conflict.schedules) {
      if (/^Schedule\/[A-Za-z0-9.-]+$/.test(ref) && (await readable(ref))) {
        schedules.push(ref);
      }
    }
    // Omit the internal key: it encodes external calendar/event identity, which the status UI does not need.
    conflicts.push({ ...conflict, key: createHash('sha256').update(conflict.key).digest('hex'), schedules });
  }
  return connectionStatusParameters(connection, await readProjectCeiling(medplum, fallbackCeiling), conflicts);
}

export function mutationStatus(connection: CalendarConnection | undefined, ceiling?: string): Parameters {
  const result = connectionStatusParameters(connection, ceiling);
  result.parameter = result.parameter?.filter((p) => !['activeConflictCount', 'conflict'].includes(p.name));
  return result;
}
