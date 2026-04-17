// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { EXT } from './constants';

interface AdHocVisitRequest {
  patientId: string;
  practitionerId: string;
  reason?: string;
  gracePeriodMinutes?: number;
}

/**
 * Bot: start-adhoc-visit
 *
 * Trigger: $execute endpoint (called by provider to start an unscheduled visit)
 *
 * Creates a virtual Encounter directly in `arrived` status with no Appointment.
 * This triggers the `create-video-room` bot via the Subscription on
 * Encounter?class=VR&status=arrived.
 * @param medplum - The Medplum client.
 * @param event - The bot event containing the ad-hoc visit request.
 * @returns The newly created Encounter resource.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<AdHocVisitRequest>): Promise<Encounter> {
  const { patientId, practitionerId, reason, gracePeriodMinutes } = event.input;

  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'arrived',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'VR',
      display: 'virtual',
    },
    type: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '448337001',
            display: 'Telemedicine consultation with patient',
          },
        ],
      },
    ],
    subject: { reference: `Patient/${patientId}` },
    participant: [{ individual: { reference: `Practitioner/${practitionerId}` } }],
    reasonCode: reason ? [{ text: reason }] : undefined,
    period: { start: new Date().toISOString() },
    extension: [
      { url: EXT.visitMode, valueCode: 'ad-hoc' },
      { url: EXT.gracePeriod, valueInteger: gracePeriodMinutes ?? 30 },
    ],
  });

  return encounter;
}
