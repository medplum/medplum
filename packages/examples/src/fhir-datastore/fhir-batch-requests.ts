// start-block imports
import { MedplumClient } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
// end-block imports

const medplum = new MedplumClient();

// start-block simpleBatchTs
await medplum.executeBatch({
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      request: {
        method: 'GET',
        url: 'Patient/homer-simpson',
      },
    },
    {
      request: {
        method: 'GET',
        url: 'Patient/marge-simpson',
      },
    },
  ],
});
// end-block simpleBatchTs
/*
// start-block simpleBatchCli
medplum post Bundle '
  {
    "resourceType": "Bundle",
    "type": "batch",
    "entry": [
      {
        "request": {
          "method": "GET",
          "url": "Patient/homer-simpson",
        },
      },
      {
        "request": {
          "method": "GET",
          "url": "Patient/marge-simpson",
        },
      },
    ],
  }'
// end-block simpleBatchCli

// start-block simpleBatchCurl
curl 'https://api.medplum.com/fhir/R4' \
  -X POST
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
  -d '{
    "resourceType": "Bundle",
    "type": "batch",
    "entry": [
      {
        "request": {
          "method": "GET",
          "url": "Patient/homer-simpson",
        },
      },
      {
        "request": {
          "method": "GET",
          "url": "Patient/marge-simpson",
        },
      },
    ],
  }'
// end-block simpleBatchCurl
*/

const batchCreate: Bundle =
  // start-block batchCreate
  {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          identifier: [
            {
              system: 'https://example-org.com/patient-ids',
              value: 'homer-simpson',
            },
          ],
          name: [
            {
              family: 'Simpson',
              given: ['Homer', 'Jay'],
            },
          ],
        },
        request: {
          method: 'POST',
          url: 'Patient',
        },
      },
      {
        resource: {
          resourceType: 'Patient',
          identifier: [
            {
              system: 'https://example-org.com/patient-ids',
              value: 'marge-simpson',
            },
          ],
          name: [
            {
              family: 'Simpson',
              given: ['Marge', 'Jacqueline'],
            },
          ],
        },
        request: {
          method: 'POST',
          url: 'Patient',
        },
      },
    ],
  };
// end-block batchCreate

const history: Bundle =
  // start-block historyEndpoint
  {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      {
        request: {
          method: 'GET',
          url: 'Patient/homer-simpson/_history',
        },
      },
      {
        request: {
          method: 'GET',
          url: 'Patient/marge-simpson/_history',
        },
      },
      {
        request: {
          method: 'GET',
          url: 'Organization/_history',
        },
      },
    ],
  };
// end-block historyEndpoint

const internalReference: Bundle =
  // start-block internalReference
  {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        // highlight-next-line
        fullUrl: 'urn:uuid:f7c8d72c-e02a-4baf-ba04-038c9f753a1c',
        resource: {
          resourceType: 'Patient',
          name: [
            {
              prefix: ['Ms.'],
              family: 'Doe',
              given: ['Jane'],
            },
          ],
          gender: 'female',
          birthDate: '1970-01-01',
        },
        request: {
          method: 'POST',
          url: 'Patient',
        },
      },
      {
        fullUrl: 'urn:uuid:7c988bc7-f811-4931-a166-7c1ac5b41a38',
        resource: {
          resourceType: 'Encounter',
          status: 'finished',
          class: { code: 'ambulatory' },
          subject: {
            // highlight-next-line
            reference: 'urn:uuid:f7c8d72c-e02a-4baf-ba04-038c9f753a1c',
            display: 'Ms. Jane Doe',
          },
          type: [
            {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: '162673000',
                  display: 'General examination of patient (procedure)',
                },
              ],
            },
          ],
        },
        request: {
          method: 'POST',
          url: 'Encounter',
        },
      },
    ],
  };
// end-block internalReference

const externalReference: Bundle =
  // start-block externalReference
  {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          name: [
            {
              prefix: ['Ms.'],
              family: 'Doe',
              given: ['Jane'],
            },
          ],
          gender: 'female',
          birthDate: '1970-01-01',
          // highlight-next-line
          generalPractitioner: [{ reference: 'Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|1234567893' }],
        },
        request: {
          method: 'POST',
          url: 'Patient',
        },
      },
      {
        resource: {
          resourceType: 'Patient',
          name: [
            {
              prefix: ['Mr.'],
              family: 'Doe',
              given: ['John'],
            },
          ],
          gender: 'male',
          birthDate: '1972-12-31',
          // highlight-next-line
          generalPractitioner: [{ reference: 'Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|1234567893' }],
        },
        request: {
          method: 'POST',
          url: 'Patient',
        },
      },
    ],
  };
// end-block externalReference

const conditional: Bundle =
  // start-block conditionalCreate
  {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        fullUrl: 'urn:uuid:4aac5fb6-c2ff-4851-b3cf-d66d63a82a17',
        resource: {
          resourceType: 'Organization',
          identifier: [
            {
              system: 'http://example-org.com/organizations',
              value: 'example-organization',
            },
          ],
          name: 'Example Organization',
        },
        request: {
          method: 'POST',
          url: 'Organization',
          // highlight-next-line
          ifNoneExist: 'identifier=https://example-org.com/organizations|example-organization',
        },
      },
      {
        fullUrl: 'urn:uuid:37b0dfaa-f320-444f-b658-01a04985b2ce',
        resource: {
          resourceType: 'Patient',
          name: [
            {
              use: 'official',
              family: 'Smith',
              given: ['Alice'],
            },
          ],
          gender: 'female',
          birthDate: '1974-12-15',
          managingOrganization: {
            reference: 'urn:uuid:4aac5fb6-c2ff-4851-b3cf-d66d63a82a17',
            display: 'Example Organization',
          },
        },
        request: {
          method: 'POST',
          url: 'Patient',
        },
      },
    ],
  };
// end-block conditionalCreate

// start-block autobatchingWrong
// Main thread pauses and waits for Promise to resolve. This request cannot be added to a batch
await medplum.createResource({
  resourceType: 'Patient',
  name: [
    {
      family: 'Smith',
      given: ['John'],
    },
  ],
});

// Main thread pauses and waits for Promise to resolve. This request cannot be added to a batch
await medplum.createResource({
  resourceType: 'Patient',
  name: [
    {
      family: 'Simpson',
      given: ['Homer', 'Jay'],
    },
  ],
});
// end-block autobatchingWrong

// start-block autobatchingCorrect
const patientsToCreate = [];

// Main thread continues
patientsToCreate.push(
  medplum.createResource({
    resourceType: 'Patient',
    name: [
      {
        family: 'Smith',
        given: ['John'],
      },
    ],
  })
);

// Main thread continues
patientsToCreate.push(
  medplum.createResource({
    resourceType: 'Patient',
    name: [
      {
        family: 'Simpson',
        given: ['Homer', 'Jay'],
      },
    ],
  })
);

// Both promises are resolved simultaneously
await Promise.all(patientsToCreate);
// end-block autobatchingCorrect

console.log(batchCreate, history, internalReference, externalReference, conditional);
