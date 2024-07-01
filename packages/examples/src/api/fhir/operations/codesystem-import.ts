import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block import
const result = await medplum.post(medplum.fhirUrl('CodeSystem', '$import').toString(), {
  resourceType: 'Parameters',
  parameter: [
    { name: 'system', valueUri: 'http://example.com/local-codes' },
    { name: 'concept', valueCoding: { code: 'VS', display: 'Vital signs' } },
    { name: 'concept', valueCoding: { code: 'HR', display: 'Heart rate' } },
    {
      name: 'property',
      part: [
        { name: 'code', valueCode: 'VS' },
        { name: 'property', valueCode: 'child' },
        { name: 'value', valueString: 'HR' },
      ],
    },
    {
      name: 'property',
      part: [
        { name: 'code', valueCode: 'HR' },
        { name: 'property', valueCode: 'units' },
        { name: 'value', valueString: 'bpm' },
      ],
    },
  ],
});
// end-block import

console.log(result);
