import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

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

// start-block reverseChainedSearchTs
await medplum.searchResources('Patient', {
  _has: 'Observation:patient:code=11557-6',
});
// end-block reverseChainedSearchTs

/*
// start-block reverseChainedSearchCli
medplum get 'Patient?_has:Observation:patient:code=11557-6'
// end-block reverseChainedSearchCli

// start-block reverseChainedSearchCurl
curl 'https://api.medplum.com/fhir/R4/Patient?_has:Observation:patient:code=11557-6' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block reverseChainedSearchCurl
*/

// start-block reverseChainedOrSearchTs
await medplum.searchResources('Patient', {
  _has: 'Observation:patient:code=15074-8,70274-6',
});
// end-block reverseChainedOrSearchTs

/*
// start-block reverseChainedOrSearchCli
medplum get 'Patient?_has:Observation:patient:code=15074-8,70274-6'
// end-block reverseChainedOrSearchCli

// start-block reverseChainedOrSearchCurl
curl 'https://api.medplum.com/fhir/R4/Patient?_has:Observation:patient:code=15074-8,70274-6' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block reverseChainedOrSearchCurl
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
