// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Encounter } from '@medplum/fhirtypes';
import { EXT } from './livekit-config';

/**
 * Extracts the LiveKit room name from an Encounter's extensions.
 * @param encounter - The FHIR Encounter resource.
 * @returns The room name string, or undefined if not set.
 */
export function getEncounterRoomName(encounter: Encounter): string | undefined {
  return encounter.extension?.find((e) => e.url === EXT.roomName)?.valueString;
}

/**
 * Extracts the waiting room status code from an Encounter's extensions.
 * @param encounter - The FHIR Encounter resource.
 * @returns The waiting room status code, or undefined if not set.
 */
export function getWaitingRoomStatus(encounter: Encounter): string | undefined {
  return encounter.extension?.find((e) => e.url === EXT.waitingRoomStatus)?.valueCode;
}

/**
 * Extracts the waiting room joined-at timestamp from an Encounter's extensions.
 * @param encounter - The FHIR Encounter resource.
 * @returns The ISO instant when the patient joined the waiting room, or undefined.
 */
export function getWaitingRoomJoinedAt(encounter: Encounter): string | undefined {
  return encounter.extension?.find((e) => e.url === EXT.waitingRoomJoinedAt)?.valueInstant;
}

/**
 * Extracts the visit mode from an Encounter's extensions.
 * @param encounter - The FHIR Encounter resource.
 * @returns `'scheduled'`, `'ad-hoc'`, or undefined if not set.
 */
export function getVisitMode(encounter: Encounter): 'scheduled' | 'ad-hoc' | undefined {
  return encounter.extension?.find((e) => e.url === EXT.visitMode)?.valueCode as
    | 'scheduled'
    | 'ad-hoc'
    | undefined;
}

/**
 * Checks whether an Encounter is a virtual/video encounter (class code `VR`).
 * @param encounter - The FHIR Encounter resource.
 * @returns True if the encounter class code is `VR`.
 */
export function isVideoEncounter(encounter: Encounter): boolean {
  return encounter.class?.code === 'VR';
}

/**
 * Checks whether an Encounter is in a joinable state.
 * @param encounter - The FHIR Encounter resource.
 * @returns True if the encounter status is `arrived` or `in-progress`.
 */
export function isJoinable(encounter: Encounter): boolean {
  return encounter.status === 'arrived' || encounter.status === 'in-progress';
}
