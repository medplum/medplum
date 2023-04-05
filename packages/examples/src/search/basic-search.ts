import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

/*
  // start-block searchSingleCurl
  curl https://api.medplum.com/fhir/R4/Patient?birthdate=1940-03-29
  // end-block searchSingleCurl
*/
// start-block searchSingle
await medplum.search('Patient', {
  birthdate: '1940-03-29',
});

// OR

await medplum.search('Patient', 'birthdate=1940-03-29');
// end-block searchSingle

// end-block searchSingleResult
// Returns:

// end-block searchSingleResult

/*
  // start-block searchOrCurl
  curl https://api.medplum.com/fhir/R4/Task?status=completed,cancelled
  // end-block searchOrCurl
*/
// start-block searchOr
await medplum.search('Task', 'status=completed,cancelled');

// OR

await medplum.search('Task', {
  status: 'completed,cancelled',
});
// end-block searchOr
