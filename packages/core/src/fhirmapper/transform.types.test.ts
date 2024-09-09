import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';
import { TypedValue } from '../types';

describe('FHIR Mapper transform - dependent', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Patient name', () => {
    const map = `
      group PIDToPatient(source src: PID, target tgt: Patient) {
        src -> tgt.resourceType = 'Patient';
        src.PID_5 as s_name -> tgt.name as t_name then xpnToName(s_name, t_name);
      }

      group xpnToName(source srcName: XPN, target tgtName: HumanName) {
        srcName._0  as s_family_name -> tgtName.family = s_family_name;
        srcName._1  as s_given0 -> tgtName.given = s_given0;
        srcName._2  as s_given1 -> tgtName.given = s_given1;
      }
    `;

    const input: TypedValue[] = [
      toTypedValue({
        PID_5: { _0: 'DOE', _1: 'JANE', _2: 'Q' },
      }),
      { type: 'Patient', value: {} } as TypedValue,
    ];

    const structureMap = parseMappingLanguage(map);
    const actual = structureMapTransform(structureMap, input);
    const expected = [{ value: { resourceType: 'Patient', name: [{ family: 'DOE', given: ['JANE', 'Q'] }] } }];

    expect(actual).toMatchObject(expected);
  });
});
