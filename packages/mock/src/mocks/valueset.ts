import { ValueSet } from '@medplum/fhirtypes';

export const exampleValueSet: ValueSet = {
  resourceType: 'ValueSet',
  status: 'active',
  expansion: {
    timestamp: '2021-01-01T00:00:00.000Z',
    contains: [
      {
        system: 'x',
        code: 'test-code',
        display: 'Test Display',
      },
      {
        system: 'x',
        code: 'test-code-2',
        display: 'Test Display 2',
      },
      {
        system: 'x',
        code: 'test-code-3',
        display: 'Test Display 3',
      },
    ],
  },
};
