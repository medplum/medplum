// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';

/**
 * Bot: on-video-room-ended
 *
 * Handles cleanup when a LiveKit room is torn down by the server
 * (e.g. empty timeout reached). Can be triggered by a LiveKit webhook
 * forwarded to a Medplum Bot endpoint.
 *
 * Ensures the Encounter is transitioned to `finished` if it isn't already.
 * @param medplum - The Medplum client.
 * @param event - The bot event containing the room webhook payload.
 * @returns Resolves when the Encounter is updated or the event is skipped.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const input = event.input as { roomName?: string; roomSid?: string };
  const roomName = input.roomName;

  if (!roomName) {
    console.log('No roomName in webhook payload — skipping');
    return;
  }

  const encounterId = roomName.replace('encounter-', '');
  let encounter: Encounter;
  try {
    encounter = await medplum.readResource('Encounter', encounterId);
  } catch {
    console.log(`Encounter/${encounterId} not found for room ${roomName}`);
    return;
  }

  if (encounter.status === 'finished') {
    console.log(`Encounter/${encounterId} already finished — skipping`);
    return;
  }

  await medplum.updateResource({
    ...encounter,
    status: 'finished',
    period: { ...encounter.period, end: new Date().toISOString() },
  } as Encounter);

  console.log(`Encounter/${encounterId} transitioned to finished (room ${roomName} ended)`);
}
