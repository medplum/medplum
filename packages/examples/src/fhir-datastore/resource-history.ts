// start-block imports
import { MedplumClient } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
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

// start-block revertChanges
// Read the history, returning a bundle of history entries
const history = await medplum.readHistory('Patient', 'homer-simpson');

// Implement your own logic to get the historic version of the resource you want.
// You will need the versionId to use the readVersion function.
const versionId = getVersionId(history);

// readVersion will return the historic Patient resource
const version = await medplum.readVersion('Patient', 'homer-simpson', versionId);

// Pass the historic version to updateResource to revert to that version
await medplum.updateResource(version);
// end-block revertChanges

function getVersionId(history: Bundle): string {
  console.log(history);
  return 'versionId';
}
