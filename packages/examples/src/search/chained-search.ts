import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block simpleChainedSearchTs
await medplum.searchResources('Observation', {
  'patient.name': 'homer',
});
// end-block simpleChainedSearchTs

/*
// start-block simpleChainedSearchCli
medplum get 'Observation?patient.name=homer'
// end-block simpleChainedSearchCli

// start-block simpleChainedSearchCurl
curl 'https://api.medplum.com/fhir/R4/Observation?patient.name=homer' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block simpleChainedSearchCurl
*/

// start-block chainedSearchTs
await medplum.searchResources('Observation', {
  'subject:Patient.name': 'homer',
});
// end-block chainedSearchTs

/*
// start-block chainedSearchCli
medplum get 'Observation?subject:Patient.name=homer'
// end-block chainedSearchCli

// start-block chainedSearchCurl
curl 'https://api.medplum.com/fhir/R4/Observation?subject:Patient.name=homer' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block chainedSearchCurl
*/

// start-block multipleChainsTs
await medplum.searchResources('Observation', {
  'encounter:Encounter.service-provider.name': 'Kaiser',
});
// end-block multipleChainsTs

/*
// start-block multipleChainsCli
medplum get 'Observation?encounter:Encounter.service-provider.name=Kaiser'
// end-block multipleChainsCli

// start-block multipleChainsCurl
curl 'https://api.medplum.com/fhir/R4/Observation?encounter:Encounter.service-provider.name=Kaiser' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block multipleChainsCurl
*/

// start-block reverseChainedSearchTs
await medplum.searchResources('Patient', {
  _has: 'Observation:subject:code=8867-4',
});
// end-block reverseChainedSearchTs

/*
// start-block reverseChainedSearchCli
medplum get 'Patient?_has:Observation:subject:code=8867-4'
// end-block reverseChainedSearchCli

// start-block reverseChainedSearchCurl
curl 'https://api.medplum.com/fhir/R4/Patient?_has:Observation:subject:code=8867-4' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block reverseChainedSearchCurl
*/

// start-block nestedReverseChainTs
await medplum.searchResources('Specimen', {
  _has: 'DiagnosticReport:specimen:_has:Procedure:reason-reference:date=2023-11-12',
});
// end-block nestedReverseChainTs

/*
// start-block nestedReverseChainCli
medplum get 'Specimen?_has:DiagnosticReport:specimen:_has:Procedure:reason-reference:date=2023-11-12'
// end-block nestedReverseChainCli

// start-block nestedReverseChainCurl
curl 'https://api.medplum.com/fhir/R4/Specimen?_has:DiagnosticReport:specimen:_has:Procedure:reason-reference:date=2023-11-12' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block nestedReverseChainCurl
*/

// start-block combinedChainTs
await medplum.searchResources('Patient', {
  _has: 'Observation:subject:performer:CareTeam.participant:Practitioner.name=bob',
});
// end-block combinedChainTs

/*
// start-block combinedChainCli
medplum get 'Patient?_has:Observation:subject:performer:CareTeam.participant:Practitioner.name=bob'
// end-block combinedChainCli

// start-block combinedChainCurl
curl 'https://api.medplum.com/fhir/R4/Patient?_has:Observation:subject:performer:CareTeam.participant:Practitioner.name=bob' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block combinedChainCurl
*/
