import { ValueSet } from '@medplum/fhirtypes';

export const exampleValueSet: ValueSet = {
  resourceType: 'ValueSet',
  expansion: {
    contains: [
      {
        system: 'x',
        code: 'test-code',
        display: 'Test Display',
      },
    ],
  },
};
