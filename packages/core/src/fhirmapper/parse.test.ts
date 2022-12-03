import { readJson } from '@medplum/definitions';
import { Bundle, StructureMap } from '@medplum/fhirtypes';
import { indexStructureDefinitionBundle } from '../types';
import { parseMappingLanguage } from './parse';

describe('FHIR Mapping Language parser', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Mapping language', () => {
    const example = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
    uses "http://hl7.org/fhir/StructureDefinition/tutorial-right" as target

    group tutorial(source src : TLeft, target tgt : TRight) {
      // rules go here
      src.a as a -> tgt.a = a "rule_a";
    }
    `;

    // Generated with org.hl7.fhir.r4.utils.StructureMapUtilities.parse
    const expected: StructureMap = {
      resourceType: 'StructureMap',
      url: 'http://hl7.org/fhir/StructureMap/tutorial',
      name: 'tutorial',
      structure: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/tutorial-left',
          mode: 'source',
        },
        {
          url: 'http://hl7.org/fhir/StructureDefinition/tutorial-right',
          mode: 'target',
        },
      ],
      group: [
        {
          name: 'tutorial',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              type: 'TLeft',
              mode: 'source',
            },
            {
              name: 'tgt',
              type: 'TRight',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'rule_a',
              source: [
                {
                  context: 'src',
                  element: 'a',
                  variable: 'a',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'a',
                  transform: 'copy',
                  parameter: [
                    {
                      valueId: 'a',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(parseMappingLanguage(example)).toMatchObject(expected);
  });
});
