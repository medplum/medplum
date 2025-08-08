// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
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

console.log(updatedPatient, patchedPatient);
