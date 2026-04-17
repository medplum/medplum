// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Extension URL constants for LiveKit and video visit FHIR extensions.
 */
export const EXT = {
  roomName: 'https://medplum.com/fhir/StructureDefinition/livekit-room-name',
  roomSid: 'https://medplum.com/fhir/StructureDefinition/livekit-room-sid',
  recordingUrl: 'https://medplum.com/fhir/StructureDefinition/video-visit-recording-url',
  visitMode: 'https://medplum.com/fhir/StructureDefinition/video-visit-mode',
  waitingRoomStatus: 'https://medplum.com/fhir/StructureDefinition/waiting-room-status',
  waitingRoomJoinedAt: 'https://medplum.com/fhir/StructureDefinition/waiting-room-joined-at',
  gracePeriod: 'https://medplum.com/fhir/StructureDefinition/room-grace-period-minutes',
  transcriptSpeaker: 'https://medplum.com/fhir/StructureDefinition/transcript-speaker',
  transcriptTimestamp: 'https://medplum.com/fhir/StructureDefinition/transcript-timestamp',
  aiAgentSource: 'https://medplum.com/fhir/StructureDefinition/ai-agent-source',
  aiConfidenceScore: 'https://medplum.com/fhir/StructureDefinition/ai-confidence-score',
} as const;
