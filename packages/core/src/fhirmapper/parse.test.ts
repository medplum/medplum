import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { indexStructureDefinitionBundle } from '../types';
import { GroupAtom, MapAtom, UsesAtom } from './atoms';
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

    const atoms = parseMappingLanguage(example);
    expect(atoms).toHaveLength(4);
    expect(atoms[0]).toBeInstanceOf(MapAtom);
    expect(atoms[1]).toBeInstanceOf(UsesAtom);
    expect(atoms[2]).toBeInstanceOf(UsesAtom);
    expect(atoms[3]).toBeInstanceOf(GroupAtom);

    const map = atoms[0] as MapAtom;
    expect(map.url).toBe('http://hl7.org/fhir/StructureMap/tutorial');
    expect(map.identifier).toBe('tutorial');

    const uses1 = atoms[1] as UsesAtom;
    expect(uses1.url).toBe('http://hl7.org/fhir/StructureDefinition/tutorial-left');
    expect(uses1.modelMode).toBe('source');

    const uses2 = atoms[2] as UsesAtom;
    expect(uses2.url).toBe('http://hl7.org/fhir/StructureDefinition/tutorial-right');
    expect(uses2.modelMode).toBe('target');

    const group = atoms[3] as GroupAtom;
    expect(group.identifier).toBe('tutorial');
    expect(group.parameters).toHaveLength(2);
    expect(group.rules).toHaveLength(1);

    const rule = group.rules[0];
    expect(rule.name).toBe('rule_a');
    expect(rule.sources).toHaveLength(1);
    expect(rule.sources[0].context).toBe('src.a');
    expect(rule.sources[0].alias).toBe('a');
    expect(rule.targets).toHaveLength(1);
    expect(rule.targets?.[0]?.context).toBe('tgt.a');
    expect(rule.targets?.[0]?.transform).toBeDefined();
  });
});
