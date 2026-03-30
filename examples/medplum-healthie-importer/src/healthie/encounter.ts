// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding, Encounter, Patient, Reference } from '@medplum/fhirtypes';
import type { HealthieAppointment } from './appointment';
import { HEALTHIE_APPOINTMENT_ID_SYSTEM, HEALTHIE_ENCOUNTER_ID_SYSTEM, HEALTHIE_PROVIDER_ID_SYSTEM } from './constants';

export function convertHealthieAppointmentToEncounter(
  appointment: HealthieAppointment,
  patientReference: Reference<Patient>
): Encounter {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    identifier: [{ system: HEALTHIE_ENCOUNTER_ID_SYSTEM, value: appointment.id }],
    status: 'finished',
    class: mapContactTypeToClass(appointment.contact_type),
    subject: patientReference,
    appointment: [
      {
        identifier: { system: HEALTHIE_APPOINTMENT_ID_SYSTEM, value: appointment.id },
      },
    ],
  };

  if (appointment.date) {
    const startDate = new Date(appointment.date);
    encounter.period = { start: startDate.toISOString() };
    if (appointment.length) {
      const endDate = new Date(startDate.getTime() + appointment.length * 60 * 1000);
      encounter.period.end = endDate.toISOString();
    }
  }

  if (appointment.length) {
    encounter.length = {
      value: appointment.length,
      unit: 'minutes',
      system: 'http://unitsofmeasure.org',
      code: 'min',
    };
  }

  if (appointment.provider) {
    encounter.participant = [
      {
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'ATND',
                display: 'attender',
              },
            ],
          },
        ],
        individual: {
          identifier: { system: HEALTHIE_PROVIDER_ID_SYSTEM, value: appointment.provider.id },
          display: appointment.provider.full_name,
        },
      },
    ];
  }

  if (appointment.appointment_type?.name) {
    encounter.type = [{ text: appointment.appointment_type.name }];
  }

  if (appointment.connected_chart_note_string) {
    const locked = appointment.connected_chart_note_locked;
    encounter.text = {
      status: locked ? 'additional' : 'generated',
      div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>Chart note: ${escapeHtml(appointment.connected_chart_note_string)}</p>${locked ? '<p>Signed and locked</p>' : ''}</div>`,
    };
  }

  return encounter;
}

export function mapContactTypeToClass(contactType?: string): Coding {
  if (!contactType) {
    return { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' };
  }
  switch (contactType.toLowerCase()) {
    case 'video call':
    case 'healthie video call':
    case 'phone call':
      return { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' };
    case 'in person':
    case 'office':
      return { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' };
    default:
      return { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
