import { Patient } from '@medplum/core';
import { evalFhirPath } from './fhirpath';

const homer: Patient = {
  resourceType: 'Patient',
  id: 'homer',
  name: [{
    given: ['Homer', 'J'],
    family: 'Simpson'
  }]
};

test('Patient.name.given', () => {
  expect(evalFhirPath(homer, 'Patient.name.given')).toEqual(['Homer', 'J']);
});
