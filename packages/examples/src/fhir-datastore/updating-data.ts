// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient } from '@medplum/core';
import type { Bundle, Patient } from '@medplum/fhirtypes';
// end-block imports

const medplum = new MedplumClient();

// start-block updateTs

const updatedPatient = await medplum.updateResource({
  resourceType: 'Patient',
  id: 'homer-simpson',
  name: [{ family: 'Simpson', given: ['Homer'] }],
});
// end-block updateTs

/*
// start-block updateCli
medplum put Patient/homer-simpson '{"resourceType":"Patient","id":"homer-simpson","name":[{"family":"Simpson","given":["Homer"]}]}'
// end-block updateCli

// start-block updateCurl
curl -X PUT 'https://api.medplum.com/fhir/R4/Patient/homer-simpson' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
  -d {"resourceType":"Patient","id":"homer-simpson","name":[{"family":"Simpson","given":["Homer"]}]}
// end-block updateCurl
*/

// start-block upsertTs
await medplum.upsertResource(
  { resourceType: 'Patient', id: 'homer-simpson', name: [{ family: 'Simpson', given: ['Homer'] }] },
  'Patient?family="Simpson"&given="Homer"'
);
// end-block upsertTs

/*
// start-block upsertCli
medplum put Patient?family="Simpson"&given="Homer" '{"resourceType":"Patient","id":"homer-simpson","name":[{"family":"Simpson","given":["Homer"]}]}'
// end-block upsertCli

// start-block upsertCurl
curl -X PUT 'https://api.medplum.com/fhir/R4/Patient?family="Simpson"&given="Homer' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
  -d {"resourceType":"Patient","id":"homer-simpson","name":[{"family":"Simpson","given":["Homer"]}]}
// end-block upsertCurl
*/

const patient: Patient = {
  resourceType: 'Patient',
};

// start-block patchTs
const patchedPatient = await medplum.patchResource('Patient', 'homer-simpson', [
  { op: 'test', path: '/meta/versionId', value: patient.meta?.versionId },
  { op: 'add', path: '/name', value: [{ family: 'Simpson', given: ['Homer'] }] },
]);
// end-block patchTs

/*
// start-block patchCli
medplum patch Patient/homer-simpson '[{"op":"add","path":"/name","value":[{"family":"Simpson","given":["Homer"]}]}]'
// end-block patchCli

// start-block patchCurl
curl -X PATCH 'https://api.medplum.com/fhir/R4/Patient/homer-simpson' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
  -d '[{"op":"add","path":"/name","value":[{"family":"Simpson","given":["Homer"]}]}]'
// end-block patchCurl
*/

// start-block safeUpdateTs
// Read the current version of the resource
const currentPatient = await medplum.readResource('Patient', 'homer-simpson');

// Update with version checking to prevent lost updates
// If another user updated the resource, this will throw an error with status 412
await medplum.updateResource(
  {
    resourceType: 'Patient',
    id: 'homer-simpson',
    name: [{ family: 'Simpson', given: ['Homer', 'Jay'] }],
  },
  {
    headers: {
      'If-Match': currentPatient.meta?.versionId ? `W/"${currentPatient.meta.versionId}"` : '',
    },
  }
);
// end-block safeUpdateTs

/*
// start-block safeUpdateCurl
# First, read the current resource to get its versionId
curl -X GET 'https://api.medplum.com/fhir/R4/Patient/homer-simpson' \
  -H 'authorization: Bearer $ACCESS_TOKEN'

# Then update with If-Match header to ensure the resource hasn't changed
curl -X PUT 'https://api.medplum.com/fhir/R4/Patient/homer-simpson' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
  -H 'If-Match: W/"abc123"' \
  -d '{"resourceType":"Patient","id":"homer-simpson","name":[{"family":"Simpson","given":["Homer","Jay"]}]}'
// end-block safeUpdateCurl
*/

// start-block batchIfMatchTs
// Read the current version of resources you want to update
const patient1 = await medplum.readResource('Patient', 'patient-1');
const patient2 = await medplum.readResource('Patient', 'patient-2');

// Create a batch with independent version checks
// Note: Bundle entry ifMatch uses ETag format W/"versionId" because it becomes an HTTP header
const versionCheckedBatch: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      request: {
        method: 'PUT',
        url: 'Patient/patient-1',
        // Bundle entries use ETag format: W/"versionId"
        // This is the same format as the If-Match HTTP header.
        ifMatch: patient1.meta?.versionId ? `W/"${patient1.meta.versionId}"` : undefined,
      },
      resource: {
        ...patient1,
        name: [{ family: 'Smith', given: ['John'] }],
      },
    },
    {
      request: {
        method: 'PUT',
        url: 'Patient/patient-2',
        ifMatch: patient2.meta?.versionId ? `W/"${patient2.meta.versionId}"` : undefined,
      },
      resource: {
        ...patient2,
        active: false,
      },
    },
  ],
};

const versionCheckedResults = await medplum.executeBatch(versionCheckedBatch);
for (const entry of versionCheckedResults.entry ?? []) {
  console.log(entry.response?.status, entry.response?.outcome);
}
// Inspect every entry. A 412 affects only that entry; reload and review it before retrying.
// end-block batchIfMatchTs

console.log(updatedPatient, patchedPatient);
