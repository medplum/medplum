// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Appointment, Patient, Reference } from '@medplum/fhirtypes';
import type { HealthieClient } from './client';
import { HEALTHIE_APPOINTMENT_ID_SYSTEM, HEALTHIE_PROVIDER_ID_SYSTEM } from './constants';

export interface HealthieAppointment {
  id: string;
  date?: string;
  contact_type?: string;
  length?: number;
  location?: string;
  pm_status?: string;
  provider?: { id: string; full_name?: string };
  appointment_type?: { id: string; name?: string };
  attendees?: { id: string; full_name?: string }[];
}

export async function fetchAppointments(
  healthie: HealthieClient,
  patientId: string,
  filter: string = 'future'
): Promise<HealthieAppointment[]> {
  const allAppointments: HealthieAppointment[] = [];
  let hasMorePages = true;
  let offset = 0;
  const pageSize = 100;
  let loopCount = 0;

  while (hasMorePages) {
    const query = `
      query fetchAppointments($patientId: ID, $filter: String, $offset: Int) {
        appointments(user_id: $patientId, filter: $filter, should_paginate: true, offset: $offset) {
          id
          date
          contact_type
          length
          location
          pm_status
          provider {
            id
            full_name
          }
          appointment_type {
            id
            name
          }
          attendees {
            id
            full_name
          }
        }
      }
    `;

    const result = await healthie.query<{ appointments: HealthieAppointment[] | null }>(query, {
      patientId,
      filter,
      offset,
    });

    const appointments = result.appointments ?? [];
    allAppointments.push(...appointments);

    hasMorePages = appointments.length === pageSize;
    offset += pageSize;

    loopCount++;
    if (loopCount > 1000) {
      throw new Error('Exiting fetchAppointments due to too many pages');
    }
  }

  return allAppointments;
}

export function convertHealthieAppointmentToFhir(
  appointment: HealthieAppointment,
  patientReference: Reference<Patient>
): Appointment {
  const fhirAppointment: Appointment = {
    resourceType: 'Appointment',
    identifier: [{ system: HEALTHIE_APPOINTMENT_ID_SYSTEM, value: appointment.id }],
    status: mapPmStatusToFhirStatus(appointment.pm_status),
    participant: [
      {
        actor: patientReference,
        status: 'accepted',
        type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'SBJ' }] }],
      },
    ],
  };

  if (appointment.date) {
    const startDate = new Date(appointment.date);
    fhirAppointment.start = startDate.toISOString();
    if (appointment.length) {
      const endDate = new Date(startDate.getTime() + appointment.length * 60 * 1000);
      fhirAppointment.end = endDate.toISOString();
      fhirAppointment.minutesDuration = appointment.length;
    }
  }

  if (appointment.appointment_type?.name) {
    fhirAppointment.appointmentType = {
      text: appointment.appointment_type.name,
    };
  }

  if (appointment.contact_type) {
    fhirAppointment.serviceType = [{ text: appointment.contact_type }];
  }

  if (appointment.provider) {
    fhirAppointment.participant?.push({
      actor: {
        identifier: { system: HEALTHIE_PROVIDER_ID_SYSTEM, value: appointment.provider.id },
        display: appointment.provider.full_name,
      },
      status: 'accepted',
      type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND' }] }],
    });
  }

  return fhirAppointment;
}

export function mapPmStatusToFhirStatus(pmStatus?: string): Appointment['status'] {
  if (!pmStatus) {
    return 'booked';
  }
  switch (pmStatus.toLowerCase()) {
    case 'occurred':
      return 'fulfilled';
    case 'no-show':
      return 'noshow';
    case 'cancelled':
    case 'late cancellation':
    case 're-scheduled':
      return 'cancelled';
    case 'checked-in':
      return 'checked-in';
    default:
      return 'booked';
  }
}
