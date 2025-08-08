// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
// end-block imports

const medplum = new MedplumClient();

// start-block createTs
const practitioner: Practitioner = await medplum.createResource({
  resourceType: 'Practitioner',
  name: [{ family: 'Smith', given: ['Alice'], prefix: ['Dr.'] }],
});
// end-block createTs

/*
// start-block createCli
medplum post Practitioner '{"resourceType":"Practitioner","name":[{"family":"Smith","given":["Alice"],"prefix":["Dr."]}]}'
// end-block createCli

// start-block createCurl
curl -X POST 'https://api.medplum.com/fhir/R4/Practitioner' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
  -d {"resourceType":"Practitioner","name":[{"family":"Smith","given":["Alice"],"prefix":["Dr."]}]}
// end-block createCurl
*/

console.log(practitioner);
