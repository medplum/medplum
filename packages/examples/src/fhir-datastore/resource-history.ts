// start-block imports
import { MedplumClient } from '@medplum/core';
// end-block imports

const medplum = new MedplumClient();

// start-block accessHistoryTs
await medplum.readHistory('Patient', 'homer-simpson');
// end-block accessHistoryTs

/*
// start-block accessHistoryCli
medplum get 'Patient/homer-simpson/_history'
// end-block accessHistoryCli

// start-block accessHistoryCurl
curl 'https://api.medplum.com/fhir/R4/Patient/homer-simpson/_history' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block accessHistoryCurl
*/
