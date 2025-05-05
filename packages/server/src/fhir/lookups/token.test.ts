import { WithId } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { loadStructureDefinitions } from '../structure';
import { TokenTable, TokenTableRow } from './token';

describe('Token lookup table', () => {
  beforeAll(() => {
    loadStructureDefinitions();
  });
  test('extractValues for multiple resources with identical tokens', () => {
    const table = new TokenTable();

    const r1: WithId<Patient> = {
      resourceType: 'Patient',
      id: '1',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [
        {
          system: 'some-system',
          value: 'a-value',
        },
        {
          system: 'some-system',
          value: 'a-value',
        },
      ],
    };

    const r2: WithId<Patient> = {
      resourceType: 'Patient',
      id: '2',
      name: [{ given: ['Bob'], family: 'Smith' }],
      identifier: [
        {
          system: 'some-system',
          value: 'a-value',
        },
        {
          system: 'some-system',
          value: 'a-value',
        },
      ],
    };

    const result: TokenTableRow[] = [];
    table.extractValues(result, r1);
    table.extractValues(result, r2);

    expect(result).toStrictEqual([
      {
        resourceId: '1',
        code: 'identifier',
        system: 'some-system',
        value: 'a-value',
      },
      {
        resourceId: '2',
        code: 'identifier',
        system: 'some-system',
        value: 'a-value',
      },
    ]);
  });
});
