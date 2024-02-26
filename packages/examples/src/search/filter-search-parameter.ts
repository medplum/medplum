// start-block imports
import { MedplumClient } from '@medplum/core';

// end-block imports

const medplum = new MedplumClient();

// start-block syntaxTs
await medplum.searchResources('Patient', {
  _filter: 'name eq "simpson"',
});
// end-block syntaxTs

/*
// start-block syntaxCli
medplum get 'Patient?_filter=name eq "simpson"'
// end-block syntaxCli

// start-block syntaxCurl
curl 'https://api.medplum.com/fhir/R4/Patient?filter=name eq "simpson"' \
	-H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block syntaxCurl
*/

// start-block logicalAndTs
await medplum.searchResources('Patient', {
  _filter: '(gender eq "male" and name co "sim")',
});
// end-block logicalAndTs

/*
// start-block logicalAndCli
medplum get 'Patient?_filter=(gender eq "male" and name co "sim")'
// end-block logicalAndCli

// start-block logicalAndCurl
curl 'https://api.medplum.com/fhir/R4/Patient?filter=(gender eq "male" and name co "sim")' \
	-H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block logicalAndCurl
*/

// start-block logicalOrTs
await medplum.searchResources('Patient', {
  _filter: '(identifier eq 12345 or phone eq "555-6789")',
});
// end-block logicalOrTs

/*
// start-block logicalOrCli
medplum get 'Patient?_filter=(identifier eq 12345 or phone eq "555-6789)"'
// end-block logicalOrCli

// start-block logicalOrCurl
curl 'https://api.medplum.com/fhir/R4/Patient?_filter=(identifier eq 12345 or phone eq "555-6789") \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block logicalOrCurl
*/

// start-block nestedTs
await medplum.searchResources('Patient', {
  _filter: '(gender eq "male" and (name co "sim" or name co "wigg"))',
});
// end-block nestedTs

/*
// start-block nestedCli
medplum get 'Patient?_filter=(name eq "male" and (name co "sim" or name co "wigg"))'
// end-block nestedCli

// start-block nestedCurl
curl 'https://api.medplum.com/fhir/R4/Patient?filter=(gender eq "male" and (name co "sim" or name co "wigg"))' \
	-H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block nestedCurl
*/
