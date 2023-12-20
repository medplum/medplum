import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

// Based on: https://github.com/hl7ch/cda-fhir-maps/blob/master/input/maps/BundleToCda.map
// Apache 2.0 License

describe('FHIR Mapper transform - C-CDA', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('CdaToBundle setup', () => {
    const map = `
    group CdaToBundle(source cda : ClinicalDocument, target bundle : Bundle) {
      cda -> bundle.entry as e, 
              e.resource = create('Composition') as composition, 
              composition.id = uuid() as uuid,
              e.fullUrl = append('urn:uuid:',uuid),
              bundle.entry as e2, 
              e2.resource = create('Patient') as patient,
              patient.id = uuid() as uuid2,
              e2.fullUrl = append('urn:uuid:',uuid2);
    }
    `;

    const input = [toTypedValue({}), toTypedValue({ resourceType: 'Bundle', entry: [] })];
    const expected = [
      toTypedValue({
        resourceType: 'Bundle',
        entry: [
          {
            fullUrl: expect.stringMatching(/^urn:uuid:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/),
            resource: {
              resourceType: 'Composition',
              id: expect.stringMatching(/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/),
            },
          },
          {
            fullUrl: expect.stringMatching(/^urn:uuid:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/),
            resource: {
              resourceType: 'Patient',
              id: expect.stringMatching(/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/),
            },
          },
        ],
      }),
    ];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });
});
