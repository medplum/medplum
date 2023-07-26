// start-block imports
import { MedplumClient } from '@medplum/core';

// end-block imports

const medplum = new MedplumClient();

// start-block searchMissingTs
await medplum.searchResources('Task', 'owner:missing=true');
// end-block searchMissingTs

/*
// start-block searchMissingCli
medplum get 'Task?owner:missing=true'
// end-block searchMissingCli

// start-block searchMissingCurl
curl 'https://api.medplum.com/fhir/R4/Task?owner:missing=true' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchMissingCurl
*/
