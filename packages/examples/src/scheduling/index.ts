// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Schedule } from '@medplum/fhirtypes';

const schedule: Schedule =
  // start-block scheduleServiceTypeLink
  {
    resourceType: 'Schedule',
    actor: [
      {
        reference: 'Practitioner/dr-alice-smith',
      },
    ],
    serviceType: [
      {
        coding: [{ code: 'office-visit' }],
        extension: [
          {
            url: 'https://medplum.com/fhir/service-type-reference',
            valueReference: {
              reference: 'HealthcareService/5d02acfd-fbe8-4537-84e4-31f5116be105',
              display: 'Office Visit',
            },
          },
        ],
      },
    ],
  };
// end-block scheduleServiceTypeLink

console.log(schedule);
