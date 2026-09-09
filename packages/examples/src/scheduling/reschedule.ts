// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block rescheduleReassignRoom
import { isResource, MedplumClient } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

// The 11am appointment with Dr. Smith in room one, which we want to move to room two
const appointmentId = 'my-appointment-id';
const serviceTypeReference = { reference: 'HealthcareService/my-healthcare-service-id' };
const schedules = [{ reference: 'Schedule/dr-smith-schedule' }, { reference: 'Schedule/room-two-schedule' }];

// 1. Find times available to Dr. Smith and room two. `ignore-appointment` tells $find to
//    compute availability as if this appointment did not exist, so the 11am slots it already
//    holds on Dr. Smith's schedule don't block it from moving.
const findUrl = medplum.fhirUrl('Appointment', '$find');
findUrl.searchParams.append('start', '2026-03-10T00:00:00Z');
findUrl.searchParams.append('end', '2026-03-10T23:59:59Z');
findUrl.searchParams.append('service-type-reference', serviceTypeReference.reference);
schedules.forEach((schedule) => findUrl.searchParams.append('schedule', schedule.reference));
findUrl.searchParams.append('ignore-appointment', `Appointment/${appointmentId}`);
const findBundle = (await medplum.get<Bundle<Appointment>>(findUrl)) as Bundle;

// 2. Pick a proposed appointment from the results
const proposal = findBundle.entry?.[0]?.resource as Appointment;

// 3. Reschedule to it, reusing the same schedules and service you searched with. The Slot
//    resources are derived from the scheduling parameters, and everything else about the
//    stored Appointment — the patient participant, the status, any clinical detail — is
//    left exactly as it was.
const response = await medplum.post<Bundle<Appointment | Slot>>(
  medplum.fhirUrl('Appointment', appointmentId, '$reschedule'),
  {
    resourceType: 'Parameters',
    parameter: [
      { name: 'start', valueDateTime: proposal.start },
      { name: 'service-type-reference', valueReference: serviceTypeReference },
      ...schedules.map((schedule) => ({ name: 'schedule', valueReference: schedule })),
    ],
  }
);

// The same Appointment resource, now pointing at newly created Slots
const rescheduled = response.entry?.map((e) => e.resource).find((r) => isResource<Appointment>(r, 'Appointment'));
// end-block rescheduleReassignRoom

console.log(rescheduled);
