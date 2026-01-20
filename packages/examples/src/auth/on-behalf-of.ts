// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient } from '@medplum/core';
// end-block imports

const MY_CLIENT_ID = 'my-client-id';
const MY_CLIENT_SECRET = 'my-client-secret';

// start-block createResourceOnBehalfOf
const medplum = new MedplumClient({
  clientId: MY_CLIENT_ID,
  clientSecret: MY_CLIENT_SECRET,
});

await medplum.createResource(
  {
    resourceType: 'Patient',
    name: [{ given: ['Homer'], family: 'Simpson' }],
  },
  {
    headers: {
      'X-Medplum': 'extended',
      'X-Medplum-On-Behalf-Of': 'ProjectMembership/00000000-001a-4722-afa1-0581d2c52a87',
    },
  }
);
// end-block createResourceOnBehalfOf

// start-block defaultHeadersOnBehalfOf
const medplumWithDefaults = new MedplumClient({
  clientId: MY_CLIENT_ID,
  clientSecret: MY_CLIENT_SECRET,
  defaultHeaders: {
    'X-Medplum': 'extended',
    'X-Medplum-On-Behalf-Of': 'ProjectMembership/00000000-001a-4722-afa1-0581d2c52a87',
  },
});
// end-block defaultHeadersOnBehalfOf

/*
// start-block curlExample
curl 'https://api.medplum.com/fhir/R4/Patient' \
  --user $MY_CLIENT_ID:$MY_CLIENT_SECRET \
  -H 'content-type: application/fhir+json' \
  -H 'x-medplum: extended' \
  -H 'x-medplum-on-behalf-of: ProjectMembership/00000000-001a-4722-afa1-0581d2c52a87' \
  --data-raw '{"resourceType":"Patient","name":[{"given":["Homer"],"family":"Simpson"}]}'
// end-block curlExample
*/

