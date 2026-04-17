// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { SignJWT } from 'jose';
import { EXT, getExtension, setExtensions } from './constants';

/**
 * Bot: create-video-room
 *
 * Trigger: Subscription on Encounter?class=VR&status=arrived
 *
 * Creates a LiveKit room for a virtual encounter via the Twirp API.
 * Idempotent — skips if room already exists on the Encounter.
 * @param medplum - The Medplum client.
 * @param event - The bot event containing the Encounter.
 * @returns Resolves when the room is created and the Encounter is updated.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<void> {
  const encounter = event.input;

  if (getExtension(encounter, EXT.roomName)) {
    console.log(`Room already exists for Encounter/${encounter.id} — skipping`);
    return;
  }

  const roomName = `encounter-${encounter.id}`;
  const isAdHoc = !encounter.appointment?.length;
  const visitMode = isAdHoc ? 'ad-hoc' : 'scheduled';
  const gracePeriodMin = Number.parseInt(getExtension(encounter, EXT.gracePeriod) ?? '15', 10);

  const apiKey = event.secrets['LIVEKIT_API_KEY']?.valueString;
  const apiSecret = event.secrets['LIVEKIT_API_SECRET']?.valueString;
  const livekitHost = event.secrets['LIVEKIT_HOST']?.valueString;

  if (!apiKey || !apiSecret || !livekitHost) {
    throw new Error('Missing LiveKit secrets (LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_HOST)');
  }

  const room = await createLiveKitRoom(livekitHost, apiKey, apiSecret, {
    name: roomName,
    empty_timeout: gracePeriodMin * 60,
    max_participants: 10,
    metadata: JSON.stringify({
      encounterId: encounter.id,
      patientId: encounter.subject?.reference,
      visitMode,
    }),
  });

  await medplum.updateResource({
    ...encounter,
    extension: setExtensions(encounter, {
      [EXT.roomName]: { valueString: roomName },
      [EXT.roomSid]: { valueString: room.sid ?? '' },
      [EXT.visitMode]: { valueCode: visitMode },
      [EXT.waitingRoomStatus]: { valueCode: 'not-waiting' },
      [EXT.gracePeriod]: { valueInteger: gracePeriodMin },
    }),
  });

  console.log(`Created ${visitMode} room "${roomName}" (grace: ${gracePeriodMin}min) for Encounter/${encounter.id}`);
}

/**
 * Sign a LiveKit API JWT using jose directly, with an absolute exp timestamp
 * to avoid the relative time-period parsing that breaks in vmcontext.
 */
async function signLiveKitJwt(apiKey: string, apiSecret: string): Promise<string> {
  const secret = new TextEncoder().encode(apiSecret);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ video: { roomCreate: true } })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(apiKey)
    .setExpirationTime(now + 30)
    .setNotBefore(now)
    .sign(secret);
}

/**
 * Call LiveKit's Twirp RoomService/CreateRoom endpoint directly via fetch.
 */
async function createLiveKitRoom(
  host: string,
  apiKey: string,
  apiSecret: string,
  body: Record<string, unknown>
): Promise<{ sid?: string; name?: string }> {
  const url = host.replace(/^ws/, 'http') + '/twirp/livekit.RoomService/CreateRoom';
  const jwt = await signLiveKitJwt(apiKey, apiSecret);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LiveKit API error ${response.status}: ${text}`);
  }

  return (await response.json()) as { sid?: string; name?: string };
}
