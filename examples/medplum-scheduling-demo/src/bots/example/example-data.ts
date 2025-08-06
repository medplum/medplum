// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, createReference, getReferenceString, MedplumClient } from '@medplum/core';
import {
  Appointment,
  Bundle,
  BundleEntry,
  CodeableConcept,
  Encounter,
  Patient,
  Practitioner,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

export async function handler(medplum: MedplumClient, event: BotEvent<Practitioner>): Promise<Bundle> {
  const practitioner = event.input as Practitioner;

  // Note that the Schedule resource is created in the App.tsx file
  const schedule = await medplum.searchOne('Schedule', { actor: getReferenceString(practitioner) });
  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const entries: BundleEntry<Patient | Slot | Appointment | Encounter>[] = [...createPatientEntries()];

  const practitionerReference = createReference(practitioner);
  const homerReference = { reference: 'urn:uuid:bd90afcc-4f44-4c13-8710-84ddc1bce347', display: 'Homer Simpson' };
  const margeReference = { reference: 'urn:uuid:eca66352-415c-4dab-add1-e4ed8a156408', display: 'Marge Simpson' };
  const scheduleReference = createReference(schedule);

  const today = new Date();

  // Create slots and appointments for the previous week, this week, and next week
  createWeekSlots(today, -1, entries, scheduleReference, practitionerReference, [margeReference, homerReference]);
  createWeekSlots(today, 0, entries, scheduleReference, practitionerReference, [margeReference, homerReference]);
  createWeekSlots(today, 1, entries, scheduleReference, practitionerReference, [margeReference, homerReference]);

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  };
  return bundle;
}

function createPatientEntries(): BundleEntry<Patient>[] {
  return [
    {
      fullUrl: 'urn:uuid:bd90afcc-4f44-4c13-8710-84ddc1bce347',
      request: { method: 'PUT', url: 'Patient?name=homer' },
      resource: {
        resourceType: 'Patient',
        active: true,
        name: [{ family: 'Simpson', given: ['Homer'] }],
        gender: 'male',
        birthDate: '1956-05-12',
      },
    },
    {
      fullUrl: 'urn:uuid:eca66352-415c-4dab-add1-e4ed8a156408',
      request: { method: 'PUT', url: 'Patient?name=marge' },
      resource: {
        resourceType: 'Patient',
        active: true,
        name: [{ family: 'Simpson', given: ['Marge'] }],
        gender: 'female',
        birthDate: '1958-03-19',
      },
    },
  ];
}

// Create slots and appointments for a week
// - Create free slots for Monday and Wednesday
// - Create appointments for Monday and Wednesday
// - Create a busy-unavailable slot for Friday
function createWeekSlots(
  baseDate: Date,
  weekOffset: number,
  entries: BundleEntry[],
  scheduleReference: Reference<Schedule>,
  practitionerReference: Reference<Practitioner>,
  patientReferences: [Reference<Patient>, Reference<Patient>]
): void {
  const [routinePatient, emergencyPatient] = patientReferences;
  // Calculate Monday, Wednesday, and Friday of the week
  const monday = new Date(baseDate);
  monday.setDate(monday.getDate() + weekOffset * 7 - ((baseDate.getDay() + 6) % 7));
  const wednesday = new Date(monday);
  wednesday.setDate(wednesday.getDate() + 2);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);

  // Create free slots and appointments for Monday and Wednesday
  [monday, wednesday].forEach((day, index) => {
    for (let hour = 9; hour < 17; hour++) {
      // Skip lunch hour
      if (hour === 12) {
        continue;
      }

      const startTime = new Date(day);
      startTime.setHours(hour, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(hour + 1, 0, 0, 0);

      const freeSlotEntry = createSlot(scheduleReference, startTime, endTime, 'free');

      if (weekOffset === -1 && index === 0 && hour === 9) {
        // Create a cancelled routine appointment on Monday at 9am + a replacement free slot
        const busySlotEntry = createSlot(scheduleReference, startTime, endTime, 'busy');
        entries.push(busySlotEntry);
        entries.push(
          createAppointment(
            practitionerReference,
            routinePatient,
            busySlotEntry,
            'cancelled',
            appointmentTypeMap.routine,
            [serviceTypeMap.consultation]
          )
        );
        entries.push(freeSlotEntry);
      } else if (weekOffset === 0 && index === 0 && hour === 10) {
        // Create a fulfilled routine appointment on Monday at 10am
        const busySlotEntry = createSlot(scheduleReference, startTime, endTime, 'busy');
        entries.push(busySlotEntry);
        const fulfilledAppointment = createAppointment(
          practitionerReference,
          routinePatient,
          busySlotEntry,
          'fulfilled',
          appointmentTypeMap.routine,
          [serviceTypeMap.consultation]
        );
        entries.push(fulfilledAppointment);
        entries.push(createEncounter(practitionerReference, routinePatient, fulfilledAppointment));
      } else if (weekOffset === 0 && index === 1 && hour === 15) {
        // Create an emergency appointment on Wednesday at 3pm
        const busySlotEntry = createSlot(scheduleReference, startTime, endTime, 'busy');
        entries.push(busySlotEntry);
        entries.push(
          createAppointment(
            practitionerReference,
            emergencyPatient,
            busySlotEntry,
            'booked',
            appointmentTypeMap.emergency,
            [serviceTypeMap.emergencyRoomAdmission]
          )
        );
      } else if (weekOffset === 1 && index === 0 && hour === 11) {
        // Create an upcoming followup appointment on Monday at 11am
        const busySlotEntry = createSlot(scheduleReference, startTime, endTime, 'busy');
        entries.push(busySlotEntry);
        entries.push(
          createAppointment(
            practitionerReference,
            routinePatient,
            busySlotEntry,
            'booked',
            appointmentTypeMap.followup,
            [serviceTypeMap.consultation],
            'Followup appointment to assess the exam results'
          )
        );
      } else if (weekOffset === 1 && index === 1 && hour === 15) {
        // Create an upcoming routine checkup appointment on Wednesday at 3pm
        const busySlotEntry = createSlot(scheduleReference, startTime, endTime, 'busy');
        entries.push(busySlotEntry);
        entries.push(
          createAppointment(
            practitionerReference,
            emergencyPatient,
            busySlotEntry,
            'booked',
            appointmentTypeMap.routine,
            [serviceTypeMap.consultation],
            'Routine checkup after the emergency room visit'
          )
        );
      } else {
        // Create a free slot
        entries.push(freeSlotEntry);
      }
    }
  });

  // Create busy-unavailable slot for Friday from 9am to 5pm
  const busyUnavailableSlot = createSlot(
    scheduleReference,
    new Date(new Date(friday).setHours(9, 0, 0, 0)),
    new Date(new Date(friday).setHours(17, 0, 0, 0)),
    'busy-unavailable'
  );
  entries.push(busyUnavailableSlot);
}

function createSlot(schedule: Reference<Schedule>, start: Date, end: Date, status: Slot['status']): BundleEntry<Slot> {
  return {
    fullUrl: `urn:uuid:${randomUUID()}`,
    request: { url: 'Slot', method: 'POST' },
    resource: {
      resourceType: 'Slot',
      schedule,
      status,
      start: start.toISOString(),
      end: end.toISOString(),
    },
  };
}

function createAppointment(
  practitioner: Reference<Practitioner>,
  patient: Reference<Patient>,
  slotEntry: BundleEntry<Slot>,
  status: Appointment['status'],
  appointmentType: Appointment['appointmentType'],
  serviceType: Appointment['serviceType'],
  comment?: Appointment['comment']
): BundleEntry<Appointment> {
  const slot = slotEntry.resource as Slot;
  const slotReference = { reference: slotEntry.fullUrl };
  const cancelationReason =
    status === 'cancelled'
      ? {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason',
              code: 'prov',
              display: 'Provider',
            },
          ],
        }
      : undefined;
  return {
    fullUrl: `urn:uuid:${randomUUID()}`,
    request: { url: 'Appointment', method: 'POST' },
    resource: {
      resourceType: 'Appointment',
      status,
      slot: [slotReference],
      start: slot.start,
      end: slot.end,
      appointmentType,
      serviceType,
      participant: [
        { actor: patient, status: 'accepted' },
        { actor: practitioner, status: 'accepted' },
      ],
      comment,
      cancelationReason,
    },
  };
}

function createEncounter(
  practitioner: Reference<Practitioner>,
  patient: Reference<Patient>,
  appointmentEntry: BundleEntry<Appointment>
): BundleEntry<Encounter> {
  const appointment = appointmentEntry.resource as Appointment;
  const appointmentReference = { reference: appointmentEntry.fullUrl };
  const duration = new Date(appointment.end as string).getTime() - new Date(appointment.start as string).getTime();
  return {
    fullUrl: `urn:uuid:${randomUUID()}`,
    request: { url: 'Encounter', method: 'POST' },
    resource: {
      resourceType: 'Encounter',
      status: 'finished',
      subject: patient,
      appointment: [appointmentReference],
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'VR',
        display: 'virtual',
      },
      serviceType: appointment.serviceType?.[0],
      period: {
        start: appointment.start,
        end: appointment.end,
      },
      length: {
        value: Math.floor(duration / 60000),
        unit: 'minutes',
      },
      participant: [
        {
          individual: practitioner,
          type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND' }] }],
        },
      ],
    },
  };
}

// Subset of http://terminology.hl7.org/ValueSet/v2-0276
const appointmentTypeMap: Record<string, CodeableConcept> = {
  followup: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
        code: 'FOLLOWUP',
        display: 'A follow up visit from a previous appointment',
      },
    ],
  },
  routine: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
        code: 'ROUTINE',
        display: 'Routine appointment - default if not valued',
      },
    ],
  },
  emergency: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
        code: 'EMERGENCY',
        display: 'Emergency appointment',
      },
    ],
  },
};

// Subset of http://example.com/appointment-service-types
const serviceTypeMap: Record<string, CodeableConcept> = {
  consultation: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '11429006',
        display: 'Consultation',
      },
    ],
  },
  emergencyRoomAdmission: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '50849002',
        display: 'Emergency room admission',
      },
    ],
  },
};
