// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * Shared pieces of the practitioner-facing operations (`Practitioner/$google-calendar-*`).
 * They are type-level operations (an instance-level custom operation would receive the
 * resource instead of the request body), and the practitioner is always `event.requester`,
 * which the server sets to the caller's own profile. Nobody can act on someone else's calendar.
 */

import type { BotEvent } from '@medplum/core';
import type { Parameters, ParametersParameter } from '@medplum/fhirtypes';
import type { CalendarConnection } from './connection';
import type { EventDetailLevel } from './constants';
import { EVENT_DETAIL_LEVELS } from './constants';
import type { CalendarConflict } from './import';
import { resolveDetailLevel } from './mapping';
import { readState } from './state';

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

export function mutationStatus(connection: CalendarConnection | undefined, ceiling?: string): Parameters {
  const result = connectionStatusParameters(connection, ceiling);
  result.parameter = result.parameter?.filter((p) => !['activeConflictCount', 'conflict'].includes(p.name));
  return result;
}
