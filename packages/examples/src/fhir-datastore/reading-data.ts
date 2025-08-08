// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient } from '@medplum/core';
// end-block imports

const medplum = new MedplumClient();

// start-block readTs
await medplum.readResource('Patient', 'homer-simpson');
// end-block readTs

/*
// start-block readCli
medplum get Patient/homer-simpson
// end-block readCli

// start-block readCurl
curl 'https://api.medplum.com/fhir/R4/Patient/homer-simpson' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block readCurl
*/
