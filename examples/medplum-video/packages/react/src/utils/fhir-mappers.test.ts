// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Encounter } from '@medplum/fhirtypes';
import { expect, test } from 'vitest';
import { EXT } from './livekit-config';
import {
  getEncounterRoomName,
  getWaitingRoomStatus,
  getWaitingRoomJoinedAt,
  getVisitMode,
  isVideoEncounter,
  isJoinable,
} from './fhir-mappers';

function makeEncounter(overrides?: Partial<Encounter>): Encounter {
  return {
    resourceType: 'Encounter',
    status: 'arrived',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
    ...overrides,
  };
}

test('getEncounterRoomName returns room name from extension', () => {
  const enc = makeEncounter({
    extension: [{ url: EXT.roomName, valueString: 'encounter-123' }],
  });
  expect(getEncounterRoomName(enc)).toBe('encounter-123');
});

test('getEncounterRoomName returns undefined when missing', () => {
  expect(getEncounterRoomName(makeEncounter())).toBeUndefined();
});

test('getWaitingRoomStatus returns status code', () => {
  const enc = makeEncounter({
    extension: [{ url: EXT.waitingRoomStatus, valueCode: 'waiting' }],
  });
  expect(getWaitingRoomStatus(enc)).toBe('waiting');
});

test('getWaitingRoomJoinedAt returns instant', () => {
  const enc = makeEncounter({
    extension: [{ url: EXT.waitingRoomJoinedAt, valueInstant: '2026-03-13T10:00:00Z' }],
  });
  expect(getWaitingRoomJoinedAt(enc)).toBe('2026-03-13T10:00:00Z');
});

test('getVisitMode returns scheduled or ad-hoc', () => {
  expect(getVisitMode(makeEncounter({ extension: [{ url: EXT.visitMode, valueCode: 'scheduled' }] }))).toBe(
    'scheduled'
  );
  expect(getVisitMode(makeEncounter({ extension: [{ url: EXT.visitMode, valueCode: 'ad-hoc' }] }))).toBe('ad-hoc');
  expect(getVisitMode(makeEncounter())).toBeUndefined();
});

test('isVideoEncounter checks class code', () => {
  expect(isVideoEncounter(makeEncounter())).toBe(true);
  expect(isVideoEncounter(makeEncounter({ class: { code: 'AMB' } }))).toBe(false);
});

test('isJoinable checks arrived or in-progress status', () => {
  expect(isJoinable(makeEncounter({ status: 'arrived' }))).toBe(true);
  expect(isJoinable(makeEncounter({ status: 'in-progress' }))).toBe(true);
  expect(isJoinable(makeEncounter({ status: 'planned' }))).toBe(false);
  expect(isJoinable(makeEncounter({ status: 'finished' }))).toBe(false);
});
