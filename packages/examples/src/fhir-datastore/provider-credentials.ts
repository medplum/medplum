// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Location, Practitioner, PractitionerRole } from '@medplum/fhirtypes';

const joeSmith: Practitioner =
  // start-block practitioner-head
  {
    id: 'JoeSmith',
    resourceType: 'Practitioner',
    name: [
      {
        text: 'Joe Smith, MD',
        family: 'Smith',
        given: ['Joe'],
      },
    ],
    // end-block practitioner-head

    // start-block qualifications-head
    qualification: [
      // end-block qualifications-head
      // start-block license
      // Medical License Level: MD
      {
        code: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
              code: 'MD',
            },
          ],
          text: 'MD',
        },
        // Medical License Issuer: State of New York
        issuer: {
          display: 'State of New York',
        },
      },
      //...
      // end-block license
      // start-block specialty
      // Internal Medicine Certification
      {
        code: {
          coding: [
            {
              system: 'http://nucc.org/provider-taxonomy',
              code: '207R00000X',
              display: 'Internal Medicine Physician',
            },
          ],
          text: 'Board Certified Internal Medicine',
        },
        issuer: {
          display: 'American Board of Internal Medicine',
        },
      },
      // Cardiology Certification
      {
        code: {
          coding: [
            {
              system: 'http://nucc.org/provider-taxonomy',
              code: '207RC0000X',
              display: 'Cardiovascular Disease Physician',
            },
          ],
          text: 'Board Certified Cardiovascular Disease',
        },
        issuer: {
          display: 'American Board of Internal Medicine',
        },
      },
      // end-block specialty
      // start-block qualifications-tail
    ],
    // end-block qualifications-tail

    meta: {
      lastUpdated: '2020-07-07T13:26:22.0314215+00:00',
      profile: ['http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/plannet-Practitioner'],
    },
    language: 'en-US',
    // start-block practitioner-tail
  };
// end-block practitioner-tail


// start-block state-location
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nyLocation: Location = {
  resourceType: 'Location',
  id: 'location-ny',
  name: 'New York',
  address: {
    state: 'NY',
    country: 'US',
  },
  identifier: [
    {
      system: 'http://terminology.hl7.org/CodeSystem/v2-0347',
      value: 'NY',
    },
  ],
};
// end-block state-location

// start-block practitioner-role-state
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const drSmithNyRole: PractitionerRole = {
  resourceType: 'PractitionerRole',
  practitioner: { reference: 'Practitioner/dr-smith' }, // Assuming 'dr-smith' is an existing Practitioner
  location: [{ reference: 'Location/location-ny' }],
  period: {
    start: '2024-01-01',
    end: '2026-01-01', // License expiration
  },
  active: true,
};
// end-block practitioner-role-state

// start-block query-by-state
// Find all active practitioners licensed in NY
// Note: In a real application, you would initialize medplum client first
// const medplum = new MedplumClient({ baseUrl: 'https://api.medplum.com/' });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nyLicensedPractitioners = await medplum.searchResources('PractitionerRole', {
  location: 'Location/location-ny',
  active: 'true',
  _revinclude: 'Practitioner:practitioner',
});
// end-block query-by-state

console.log(joeSmith);
