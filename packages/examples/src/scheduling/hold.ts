// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block holdOne
import { isResource, MedplumClient } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const result = await medplum.post<Bundle<Appointment | Slot>>(medplum.fhirUrl('Appointment', '$hold'), {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'appointment',
      resource: {
        resourceType: 'Appointment',
        status: 'proposed',
        start: '2026-03-10T09:00:00.000Z',
        end: '2026-03-10T10:00:00.000Z',
        serviceType: [
          {
            coding: [{ code: 'initial-visit' }],
            extension: [
              {
                url: 'https://medplum.com/fhir/service-type-reference',
                valueReference: { reference: 'HealthcareService/my-healthcareservice-id' },
              },
            ],
          },
        ],
        participant: [
          {
            actor: { reference: 'Practitioner/dr-smith' },
            required: 'required',
            status: 'needs-action',
          },
        ],
        contained: [
          {
            resourceType: 'Slot',
            status: 'busy',
            schedule: { reference: 'Schedule/dr-smith-schedule' },
            start: '2026-03-10T09:00:00.000Z',
            end: '2026-03-10T10:00:00.000Z',
          } satisfies Slot,
        ],
      } satisfies Appointment,
    },
  ],
});

const appointment = result.entry?.map((e) => e.resource).find((r) => isResource<Appointment>(r, 'Appointment'));
// end-block holdOne

console.log(appointment);
