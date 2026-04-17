// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { RoomServiceClient } from 'livekit-server-sdk';
import { EXT } from './constants';

/**
 * Bot: on-encounter-status-change
 *
 * Trigger: Subscription on Encounter?class=VR (update only)
 *
 * Handles encounter status transitions for video visits:
 * - in-progress: optionally dispatch AI agent
 * - finished: close the LiveKit room
 * @param medplum - The Medplum client.
 * @param event - The bot event containing the updated Encounter.
 * @returns Resolves when the status transition side-effects are complete.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<void> {
  const encounter = event.input;

  if (encounter.status === 'in-progress') {
    console.log(`Encounter/${encounter.id} is now in-progress`);
  }

  if (encounter.status === 'finished') {
    const roomName = encounter.extension?.find((e) => e.url === EXT.roomName)?.valueString;

    if (roomName) {
      const apiKey = event.secrets['LIVEKIT_API_KEY']?.valueString;
      const apiSecret = event.secrets['LIVEKIT_API_SECRET']?.valueString;
      const livekitHost = event.secrets['LIVEKIT_HOST']?.valueString;

      if (apiKey && apiSecret && livekitHost) {
        const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);
        try {
          await roomService.deleteRoom(roomName);
          console.log(`Closed LiveKit room "${roomName}" for Encounter/${encounter.id}`);
        } catch (err) {
          console.log(`Room ${roomName} may already be closed: ${err}`);
        }
      }
    }

    if (!encounter.period?.end) {
      await medplum.updateResource({
        ...encounter,
        period: { ...encounter.period, end: new Date().toISOString() },
      } as Encounter);
    }
  }
}
