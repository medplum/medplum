import { Practitioner } from '@medplum/fhirtypes';

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
        // Extension: Medical License Valid in NY
        extension: [
          {
            url: 'http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/practitioner-qualification',
            extension: [
              {
                url: 'whereValid',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://www.usps.com/',
                      code: 'NY',
                    },
                  ],
                },
              },
            ],
          },
        ],
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
        extension: [
          {
            extension: [
              {
                url: 'status',
                valueCode: 'active',
              },
              {
                url: 'whereValid',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://www.usps.com/',
                      code: 'NY',
                    },
                  ],
                },
              },
            ],
            url: 'http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/practitioner-qualification',
          },
        ],
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
        extension: [
          {
            extension: [
              {
                url: 'status',
                valueCode: 'active',
              },
              {
                url: 'whereValid',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'https://www.usps.com/',
                      code: 'NY',
                    },
                  ],
                },
              },
            ],
            url: 'http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/practitioner-qualification',
          },
        ],
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

console.log(joeSmith);
