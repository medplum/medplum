// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block rescheduleOne
import { isResource, MedplumClient } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

// 1. Find a new available time
const findUrl = medplum.fhirUrl('Appointment', '$find');
findUrl.searchParams.append('start', '2026-03-11T00:00:00Z');
findUrl.searchParams.append('end', '2026-03-11T23:59:59Z');
findUrl.searchParams.append('service-type-reference', 'HealthcareService/my-healthcare-service-id');
findUrl.searchParams.append('schedule', 'Schedule/my-schedule-id');
const findBundle = (await medplum.get<Bundle<Appointment>>(findUrl)) as Bundle;

// 2. Pick a proposed appointment from the results
const proposedAppointment = findBundle.entry?.[0]?.resource as Appointment;

// 3. Reschedule the existing appointment onto that new time
const bundle = await medplum.post<Bundle<Appointment | Slot>>(
  medplum.fhirUrl('Appointment', 'my-appointment-id', '$reschedule'),
  {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'appointment',
        resource: proposedAppointment,
      },
    ],
  }
);

const appointment = bundle.entry?.map((e) => e.resource)?.find((e) => isResource<Appointment>(e, 'Appointment'));
// end-block rescheduleOne

console.log(appointment);
