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
      fullUrl: 'urn:uuid:homer-simpson-uuid',
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
      fullUrl: 'urn:uuid:marge-simpson-uuid',
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
        "fullUrl": "urn:uuid:homer-simpson-uuid",
        "resource": {
          "resourceType": "Patient",
          "identifier": [
            {
              "system": "https://example-org.com/patient-ids",
              "value": "homer-simpson",
            },
          ],
          "name": [
            {
              "family": "Simpson",
              "given": ["Homer", "Jay"],
            },
          ],
        },
        "request": {
          "method": "POST",
          "url": "Patient",
        },
      },
      {
        "fullUrl": "urn:uuid:marge-simpson-uuid",
        "resource": {
          "resourceType": "Patient",
          "identifier": [
            {
              "system": "https://example-org.com/patient-ids",
              "value": "marge-simpson",
            },
          ],
          "name": [
            {
              "family": "Simpson",
              "given": ["Marge", "Jacqueline"],
            },
          ],
        },
        "request": {
          "method": "Post",
          "url": "Patient",
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
        "fullUrl": "urn:uuid:homer-simpson-uuid",
        "resource": {
          "resourceType": "Patient",
          "identifier": [
            {
              "system": "https://example-org.com/patient-ids",
              "value": "homer-simpson",
            },
          ],
          "name": [
            {
              "family": "Simpson",
              "given": ["Homer", "Jay"],
            },
          ],
        },
        "request": {
          "method": "POST",
          "url": "Patient",
        },
      },
      {
        "fullUrl": "urn:uuid:marge-simpson-uuid",
        "resource": {
          "resourceType": "Patient",
          "identifier": [
            {
              "system": "https://example-org.com/patient-ids",
              "value": "marge-simpson",
            },
          ],
          "name": [
            {
              "family": "Simpson",
              "given": ["Marge", "Jacqueline"],
            },
          ],
        },
        "request": {
          "method": "Post",
          "url": "Patient",
        },
      },
    ],
  }'
// end-block simpleBatchCurl
*/

const createThenUpdate: Bundle =
  // start-block createThenUpdate
  {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      {
        fullUrl: 'urn:uuid:homer-simpson-uuid',
        resource: {
          resourceType: 'Patient',
          identifier: [
            {
              system: 'http://example-hospital.org/mrns',
              value: '234543',
            },
          ],
          name: [
            {
              family: 'Simpson',
              given: ['Homer', 'Jay'],
            },
          ],
          gender: 'male',
          birthDate: '1956-05-12',
        },
        request: {
          method: 'POST',
          url: 'Patient',
        },
      },
      {
        resource: {
          resourceType: 'Patient',
          id: 'urn:uuid:homer-simpson-uuid',
          address: [
            {
              use: 'home',
              type: 'physical',
              text: '742 Evergreen Terrace, Springfield',
            },
          ],
        },
        request: {
          method: 'PUT',
          url: 'Patient?identifer=http://example-hospital.org/mrns|234543',
        },
      },
    ],
  };
// end-block createThenUpdate

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
    type: 'batch',
    entry: [
      {
        fullUrl: 'urn:uuid:jane-doe-uuid',
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
        fullUrl: 'urn:uuid:example-encounter-uuid',
        resource: {
          resourceType: 'Encounter',
          status: 'finished',
          subject: {
            reference: 'urn:uuid:jane-doe-uuid',
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

const conditional: Bundle =
  // start-block conditionalCreate
  {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      {
        fullUrl: 'urn:uuid:alice-smith-uuid',
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
            reference: 'urn:uuid:example-organization',
            display: 'Example Organization',
          },
        },
        request: {
          method: 'POST',
          url: 'Patient',
        },
      },
      {
        fullUrl: 'urn:uuid:example-organization',
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
          ifNoneExist: 'identifer=https://example-org.com/organizations|example-organization',
        },
      },
    ],
  };
// end-block conditionalCreate

// start-block awaitPromise
// Main thread pauses and waits for Promise to resolve. This request cannot be added to a batch
await medplum.createResource({
  resourceType: 'Patient',
  id: 'john-smith',
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
  id: 'homer-simpson',
  name: [
    {
      family: 'Simpson',
      given: ['Homer', 'Jay'],
    },
  ],
});
// end-block awaitPromise

// start-block resolveAll
const patientsToCreate = [];

// Main thread continues
patientsToCreate.push(
  medplum.createResource({
    resourceType: 'Patient',
    id: 'john-smith',
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
    id: 'homer-simpson',
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
// end-block resolveAll

console.log(createThenUpdate, history, internalReference, conditional);
