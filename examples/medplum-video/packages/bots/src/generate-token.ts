// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { SignJWT } from 'jose';
import { EXT } from './constants';

interface TokenRequest {
  encounterId: string;
  participantRole: 'provider' | 'patient' | 'observer';
}

/**
 * Bot: generate-token
 *
 * Trigger: $execute endpoint (called by frontend)
 *
 * Issues a LiveKit access token for a participant. Patients who join
 * before the provider admits them receive a restricted token
 * (canPublish: false) — they can see the waiting room UI but don't
 * send audio/video until admitted.
 *
 * Uses jose directly instead of livekit-server-sdk's AccessToken to
 * avoid the relative time-period parsing bug in Medplum's vmcontext.
 * @param medplum - The Medplum client.
 * @param event - The bot event containing the token request.
 * @returns The generated token, room name, host URL, and waiting room flag.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<TokenRequest>): Promise<any> {
  const { encounterId, participantRole } = event.input;

  const encounter = await medplum.readResource('Encounter', encounterId);
  const roomName = encounter.extension?.find((e) => e.url === EXT.roomName)?.valueString;

  if (!roomName) {
    throw new Error('Video room not yet created for this encounter');
  }

  const profile = event.secrets['MEDPLUM_PROFILE_REFERENCE']?.valueString;
  const displayName = event.secrets['MEDPLUM_PROFILE_DISPLAY']?.valueString ?? 'Participant';

  const apiKey = event.secrets['LIVEKIT_API_KEY']?.valueString;
  const apiSecret = event.secrets['LIVEKIT_API_SECRET']?.valueString;

  if (!apiKey || !apiSecret) {
    throw new Error('Missing LiveKit secrets (LIVEKIT_API_KEY, LIVEKIT_API_SECRET)');
  }

  const isPatientWaiting = participantRole === 'patient' && encounter.status !== 'in-progress';
  const identity = profile ?? `${participantRole}-${Date.now()}`;

  const jwt = await signLiveKitToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    metadata: JSON.stringify({
      role: participantRole,
      encounterId,
      waitingRoom: isPatientWaiting,
    }),
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: participantRole === 'provider' || (!isPatientWaiting && participantRole === 'patient'),
      canSubscribe: true,
      canPublishData: true,
    },
  });

  if (isPatientWaiting) {
    const existingExts = (encounter.extension ?? []).filter(
      (e) => e.url !== EXT.waitingRoomStatus && e.url !== EXT.waitingRoomJoinedAt
    );
    await medplum.updateResource({
      ...encounter,
      extension: [
        ...existingExts,
        { url: EXT.waitingRoomStatus, valueCode: 'waiting' },
        { url: EXT.waitingRoomJoinedAt, valueInstant: new Date().toISOString() },
      ],
    } as Encounter);
  }

  return {
    token: jwt,
    roomName,
    livekitHost: event.secrets['LIVEKIT_WS_URL']?.valueString,
    waitingRoom: isPatientWaiting,
  };
}

/**
 * Sign a LiveKit participant JWT using jose directly with absolute timestamps,
 * bypassing livekit-server-sdk's AccessToken which uses relative time strings
 * that break in Medplum's vmcontext sandbox.
 */
async function signLiveKitToken(
  apiKey: string,
  apiSecret: string,
  grants: {
    identity: string;
    name?: string;
    metadata?: string;
    video: Record<string, unknown>;
  }
): Promise<string> {
  const secret = new TextEncoder().encode(apiSecret);
  const now = Math.floor(Date.now() / 1000);
  const SIX_HOURS = 6 * 60 * 60;

  return new SignJWT({
    sub: grants.identity,
    name: grants.name,
    metadata: grants.metadata,
    video: grants.video,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(apiKey)
    .setExpirationTime(now + SIX_HOURS)
    .setNotBefore(now)
    .setSubject(grants.identity)
    .sign(secret);
}
