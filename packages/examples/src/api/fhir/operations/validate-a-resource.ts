import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block validate
medplum.validateResource({
  resourceType: 'Patient',
  name: [{ given: ['Alice'], family: 'Smith' }],
});
// end-block validate
