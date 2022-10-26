import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block validate
const result = await medplum.validateResource({
  resourceType: 'Patient',
  name: [{ given: ['Alice'], family: 'Smith' }],
});
// end-block validate

console.log(result);
