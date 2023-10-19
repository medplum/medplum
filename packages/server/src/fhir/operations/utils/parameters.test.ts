import { Parameters } from '@medplum/fhirtypes';
import { parseParameters } from './parameters';

describe('FHIR Operation Parameters parsing', () => {
  test('Read Parameters', () => {
    const input: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'x', valueString: 'y' },
        { name: 'a', valueString: 'b' },
      ],
    };

    const result = parseParameters(input);
    expect(result).toMatchObject({ x: 'y', a: 'b' });
  });

  test('Empty Parameters', () => {
    const input: Parameters = { resourceType: 'Parameters' };
    const result = parseParameters(input);
    expect(result).toMatchObject({});
  });

  test('Read JSON', () => {
    const input = { x: 'y', a: 'b' };
    const result = parseParameters(input);
    expect(result).toMatchObject({ x: 'y', a: 'b' });
  });
});
