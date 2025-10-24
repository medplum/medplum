// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle } from '@medplum/fhirtypes';

export const testData: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:6f7d3266-1f6a-4d6b-be08-5e5fc19c01e9',
      request: { method: 'POST', url: 'Patient' },
      resource: {
        resourceType: 'Patient',
        name: [
          {
            given: ['Homer'],
            family: 'Simpson',
          },
        ],
        gender: 'male',
        birthDate: '2003-02-24T14:33:34.326Z',
        telecom: [
          {
            system: 'email',
            value: 'homersimpson@aol.com',
          },
          {
            system: 'phone',
            use: 'mobile',
            value: '3405559023',
          },
        ],
        address: [
          {
            use: 'home',
            line: ['742 Evergreen Terrace'],
            city: 'Springfield',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:c5053eed-5f22-4818-8f81-c1edb864703b',
      request: { method: 'POST', url: 'Organization' },
      resource: {
        resourceType: 'Organization',
        name: 'Independence Blue Cross Blue Shield',
      },
    },
    {
      fullUrl: '29b59d2d-a47c-4b8f-a0d7-7d87bd7195d7',
      request: { method: 'POST', url: 'Coverage' },
      resource: {
        resourceType: 'Coverage',
        status: 'active',
        beneficiary: { reference: 'urn:uuid:6f7d3266-1f6a-4d6b-be08-5e5fc19c01e9', display: 'Homer Simpson' },
        payor: [
          {
            reference: 'urn:uuid:c5053eed-5f22-4818-8f81-c1edb864703b',
            display: 'Independence Blue Cross Blue Shield',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:59811b9f-3b5f-4cce-83cb-51ee1e4e7be2',
      request: { method: 'POST', url: 'Practitioner' },
      resource: {
        resourceType: 'Practitioner',
        name: [
          {
            given: ['Kevin'],
            family: 'Smith',
          },
        ],
        qualification: [
          {
            code: {
              coding: [
                {
                  display: 'General Practitioner',
                },
              ],
            },
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:bee47170-488a-4190-a75a-4f79bc3f9328',
      request: { method: 'POST', url: 'Encounter' },
      resource: {
        resourceType: 'Encounter',
        identifier: [
          {
            system: 'http://example.org/encounters',
            value: 'example-encounter',
          },
        ],
        status: 'finished',
        period: {
          end: '2024-06-10T14:33:34.326Z',
        },
        class: {
          system: 'http://ama-assn.org/go/cpt',
          code: '99204',
          display: 'New patient office visit',
        },
        serviceType: {
          coding: [
            {
              system: 'http://ama-assn.org/go/cpt',
              code: '71045',
              display: 'Radiological examination, chest; single view ',
            },
          ],
        },
        subject: { reference: 'urn:uuid:6f7d3266-1f6a-4d6b-be08-5e5fc19c01e9', display: 'Homer Simpson' },
        participant: [
          {
            type: [
              {
                coding: [
                  {
                    code: 'ATND',
                    display: 'Attender',
                  },
                ],
              },
            ],
            individual: { reference: 'urn:uuid:59811b9f-3b5f-4cce-83cb-51ee1e4e7be2', display: 'Kevin Smith' },
          },
        ],
      },
    },
  ],
};

const dd = {
  content: [
    {
      text: 'Patient Information',
      style: 'header',
    },
    {
      table: {
        body: [
          ['Name:', 'Homer Simpson'],
          ['Age:', 21],
          ['Gender:', undefined],
          ['Date of Birth:', '2/24/2003'],
          ['Phone Number:', '3405559023'],
          ['Email Address:', 'homersimpson@aol.com'],
          ['Home Address:', '742 Evergreen Terrace, Springfield'],
        ],
      },
      layout: 'noBorders',
      margin: [0, 10],
    },
    {
      text: 'Insurance Information',
      sytle: 'header',
    },
    {
      table: {
        body: [
          ['Insurer:', 'Independence Blue Cross Blue Shield'],
          ['Policy Number:', '4290824'],
        ],
      },
    },
    [
      {
        text: 'Provider Information',
        style: 'header',
      },
      {
        table: {
          body: [
            ['Physician Name:', 'Kevin Smith'],
            ['Title:', 'General Practitioner'],
            ['Date:', '2024-06-14T14:51:23.458Z'],
          ],
        },
      },
    ],
    [
      {
        table: {
          body: [
            [
              {
                text: '',
                noWrap: true,
              },
              'New patient office visit',
              {
                text: '100',
                noWrap: true,
              },
            ],
            [
              {
                text: '',
                noWrap: true,
              },
              'Radiological examination, chest; single view',
              {
                text: '80',
                noWrap: true,
              },
            ],
          ],
        },
      },
    ],
  ],
  styles: {
    tableHeader: {
      bold: true,
      fontSize: 13,
      color: 'black',
      alignment: 'center',
    },
    header: {
      bold: true,
      fontSize: 13,
    },
  },
};

console.log(dd);
