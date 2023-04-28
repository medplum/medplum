import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block search
await medplum.search('Observation', {
  code: 'http://loinc.org|78012-2',
  _include: 'Observation:patient',
  '_include:iterate': 'Patient:link',
});
// end-block search
