import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block request
const result = await medplum.post(medplum.fhirUrl('ValueSet', '$validate-code').toString(), {
  resourceType: 'Parameters',
  parameter: [
    { name: 'url', valueUri: 'http://hl7.org/fhir/ValueSet/condition-severity' },
    { name: 'coding', valueCoding: { system: 'http://snomed.info/sct', code: '255604002' } },
  ],
});
// end-block request

console.log(result);
