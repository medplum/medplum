import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block expand
const url = 'http://hl7.org/fhir/ValueSet/administrative-gender';
const input = 'f';
const result = await medplum.searchValueSet(url, input);
// end-block expand

console.log(result);
