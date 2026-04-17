// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { SignJWT } from 'jose';
import { EXT } from './constants';

interface AdmitRequest {
  encounterId: string;
}

/**
 * Bot: admit-patient
 *
 * Trigger: $execute endpoint (called by provider to admit patient from waiting room)
 *
 * Transitions the encounter to `in-progress`, updates waiting room status to
 * "admitted", and re-grants publish permissions to patient participants via
 * LiveKit Room Service so they can send audio/video.
 *
 * Uses direct Twirp fetch instead of RoomServiceClient to avoid
 * protobuf-es/jose compatibility issues in Medplum's vmcontext sandbox.
 * @param medplum - The Medplum client.
 * @param event - The bot event containing the admit request.
 * @returns Resolves when the patient is admitted and permissions are updated.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<AdmitRequest>): Promise<void> {
  const { encounterId } = event.input;
  const encounter = await medplum.readResource('Encounter', encounterId);

  const roomName = encounter.extension?.find((e) => e.url === EXT.roomName)?.valueString;
  if (!roomName) {
    throw new Error('No video room for this encounter');
  }

  const updatedExts = (encounter.extension ?? []).filter((e) => e.url !== EXT.waitingRoomStatus);
  await medplum.updateResource({
    ...encounter,
    status: 'in-progress',
    extension: [...updatedExts, { url: EXT.waitingRoomStatus, valueCode: 'admitted' }],
  } as Encounter);

  const apiKey = event.secrets['LIVEKIT_API_KEY']?.valueString;
  const apiSecret = event.secrets['LIVEKIT_API_SECRET']?.valueString;
  const livekitHost = event.secrets['LIVEKIT_HOST']?.valueString;

  if (!apiKey || !apiSecret || !livekitHost) {
    throw new Error('Missing LiveKit secrets');
  }

  const jwt = await signLiveKitJwt(apiKey, apiSecret, roomName);
  const baseUrl = livekitHost.replace(/^ws/, 'http');

  const participants = await livekitTwirp<{ participants?: Array<{ identity: string; metadata?: string }> }>(
    baseUrl,
    jwt,
    'RoomService',
    'ListParticipants',
    { room: roomName }
  );

  for (const p of participants.participants ?? []) {
    if (!p.metadata) continue;
    try {
      const meta = JSON.parse(p.metadata) as { role?: string };
      if (meta.role === 'patient') {
        await livekitTwirp(baseUrl, jwt, 'RoomService', 'UpdateParticipant', {
          room: roomName,
          identity: p.identity,
          permission: { can_publish: true, can_subscribe: true, can_publish_data: true },
        });
      }
    } catch {
      // skip participants with malformed metadata
    }
  }

  console.log(`Admitted patient into Encounter/${encounterId}`);
}

async function signLiveKitJwt(apiKey: string, apiSecret: string, room: string): Promise<string> {
  const secret = new TextEncoder().encode(apiSecret);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ video: { roomAdmin: true, room } })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(apiKey)
    .setExpirationTime(now + 30)
    .setNotBefore(now)
    .sign(secret);
}

async function livekitTwirp<T>(
  baseUrl: string,
  jwt: string,
  service: string,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${baseUrl}/twirp/livekit.${service}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LiveKit ${method} error ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}
