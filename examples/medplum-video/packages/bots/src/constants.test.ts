// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Encounter } from '@medplum/fhirtypes';
import { expect, test } from 'vitest';
import { EXT, getExtension, setExtensions } from './constants';

test('getExtension returns valueString', () => {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'arrived',
    class: { code: 'VR' },
    extension: [{ url: EXT.roomName, valueString: 'test-room' }],
  };
  expect(getExtension(encounter, EXT.roomName)).toBe('test-room');
});

test('getExtension returns valueCode', () => {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'arrived',
    class: { code: 'VR' },
    extension: [{ url: EXT.visitMode, valueCode: 'ad-hoc' }],
  };
  expect(getExtension(encounter, EXT.visitMode)).toBe('ad-hoc');
});

test('getExtension returns valueInteger as string', () => {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'arrived',
    class: { code: 'VR' },
    extension: [{ url: EXT.gracePeriod, valueInteger: 30 }],
  };
  expect(getExtension(encounter, EXT.gracePeriod)).toBe('30');
});

test('getExtension returns undefined for missing extension', () => {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'arrived',
    class: { code: 'VR' },
  };
  expect(getExtension(encounter, EXT.roomName)).toBeUndefined();
});

test('setExtensions adds new extensions', () => {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'arrived',
    class: { code: 'VR' },
  };
  const result = setExtensions(encounter, {
    [EXT.roomName]: { valueString: 'test-room' },
    [EXT.visitMode]: { valueCode: 'scheduled' },
  });

  expect(result).toHaveLength(2);
  expect(result?.find((e) => e.url === EXT.roomName)?.valueString).toBe('test-room');
  expect(result?.find((e) => e.url === EXT.visitMode)?.valueCode).toBe('scheduled');
});

test('setExtensions replaces existing extensions', () => {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'arrived',
    class: { code: 'VR' },
    extension: [
      { url: EXT.roomName, valueString: 'old-room' },
      { url: 'https://other.ext', valueString: 'keep-me' },
    ],
  };
  const result = setExtensions(encounter, {
    [EXT.roomName]: { valueString: 'new-room' },
  });

  expect(result).toHaveLength(2);
  expect(result?.find((e) => e.url === EXT.roomName)?.valueString).toBe('new-room');
  expect(result?.find((e) => e.url === 'https://other.ext')?.valueString).toBe('keep-me');
});

test('getExtension returns valueInstant', () => {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'arrived',
    class: { code: 'VR' },
    extension: [{ url: EXT.waitingRoomJoinedAt, valueInstant: '2026-03-13T10:00:00Z' }],
  };
  expect(getExtension(encounter, EXT.waitingRoomJoinedAt)).toBe('2026-03-13T10:00:00Z');
});

test('EXT constants are defined', () => {
  expect(EXT.roomName).toContain('livekit-room-name');
  expect(EXT.roomSid).toContain('livekit-room-sid');
  expect(EXT.visitMode).toContain('video-visit-mode');
  expect(EXT.waitingRoomStatus).toContain('waiting-room-status');
  expect(EXT.gracePeriod).toContain('room-grace-period-minutes');
  expect(EXT.transcriptSpeaker).toContain('transcript-speaker');
  expect(EXT.transcriptTimestamp).toContain('transcript-timestamp');
  expect(EXT.aiAgentSource).toContain('ai-agent-source');
  expect(EXT.aiConfidenceScore).toContain('ai-confidence-score');
});
