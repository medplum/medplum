// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Encounter } from '@medplum/fhirtypes';

export const EXT = {
  roomName: 'https://medplum.com/fhir/StructureDefinition/livekit-room-name',
  roomSid: 'https://medplum.com/fhir/StructureDefinition/livekit-room-sid',
  recordingUrl: 'https://medplum.com/fhir/StructureDefinition/video-visit-recording-url',
  visitMode: 'https://medplum.com/fhir/StructureDefinition/video-visit-mode',
  waitingRoomStatus: 'https://medplum.com/fhir/StructureDefinition/waiting-room-status',
  waitingRoomJoinedAt: 'https://medplum.com/fhir/StructureDefinition/waiting-room-joined-at',
  gracePeriod: 'https://medplum.com/fhir/StructureDefinition/room-grace-period-minutes',
  aiAgentSource: 'https://medplum.com/fhir/StructureDefinition/ai-agent-source',
  aiConfidenceScore: 'https://medplum.com/fhir/StructureDefinition/ai-confidence-score',
  transcriptSpeaker: 'https://medplum.com/fhir/StructureDefinition/transcript-speaker',
  transcriptTimestamp: 'https://medplum.com/fhir/StructureDefinition/transcript-timestamp',
} as const;

/**
 * Retrieves the value of a named extension from an Encounter.
 * @param encounter - The Encounter resource to search.
 * @param url - The extension URL to look for.
 * @returns The extension value as a string, or undefined if not found.
 */
export function getExtension(encounter: Encounter, url: string): string | undefined {
  for (const ext of encounter.extension ?? []) {
    if (ext.url === url) {
      return ext.valueString ?? ext.valueCode ?? ext.valueInteger?.toString() ?? ext.valueUrl ?? ext.valueInstant;
    }
  }
  return undefined;
}

/**
 * Replaces or adds extensions on an Encounter.
 * @param encounter - The Encounter resource to update.
 * @param updates - A map of extension URLs to their new values.
 * @returns The merged extension array.
 */
export function setExtensions(
  encounter: Encounter,
  updates: Record<
    string,
    {
      valueString?: string;
      valueCode?: string;
      valueInteger?: number;
      valueInstant?: string;
      valueUrl?: string;
    }
  >
): Encounter['extension'] {
  const existing = (encounter.extension ?? []).filter((e) => !(e.url in updates));
  const added = Object.entries(updates).map(([url, value]) => ({ url, ...value }));
  return [...existing, ...added];
}
