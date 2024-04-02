import { readJson } from '@medplum/definitions';
import { Bundle, StructureMap } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';

describe('FHIR Mapping Language parser', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Minimal example', () => {
    const input = `
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
      status: 'active',
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

    expect(parseMappingLanguage(input)).toMatchObject(expected);
  });

  test('Embedded concept map', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/Claim4to3" = "R4 to R3 Conversion for Claim"

    conceptmap "Use" {
      prefix s = "http://hl7.org/fhir/claim-use"
      prefix t = "http://hl7.org/fhir/claim-use"

      s:claim - t:complete
      s:preauthorization - t:proposed
      s:predetermination - t:exploratory
    }`;

    expect(() => parseMappingLanguage(input)).not.toThrow();
  });

  test('Check clause', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.dependency as vs0 check type = 'reference' -> tgt.dependsOn as vt0 then dependency(vs0, vt0);
    }`;

    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.source?.[0]?.check).toEqual("type = 'reference'");
  });

  test('Rule source list mode', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.coding first as vs0 then Coding(vs0, tgt);
    }`;

    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.source?.[0]?.listMode).toEqual('first');
  });

  test('Rule source default', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.a default "x" as a -> tgt.a = a "rule_a";
    }`;

    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.source?.[0]?.defaultValueString).toBe('x');
  });

  test('Rule source log', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.a as a log "x" -> tgt.a = a "rule_a";
    }`;

    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.source?.[0]?.logMessage).toBe('x');
  });

  test('Rule target first', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.a as a log "x" -> tgt.a first;
    }`;

    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.target?.[0]?.listMode?.[0]).toBe('first');
  });

  test('Rule target share', () => {
    // The spec does not define a token after "share", but the FHIRCH maps include them.
    // See: https://github.com/hl7ch/cda-fhir-maps/blob/master/input/maps/BundleToCda.map#L76

    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.a as a log "x" -> tgt.a share docCode;
    }`;

    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.target?.[0]?.listMode?.[0]).toBe('share');
  });

  test('Multiple rule sources', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.author as vs, src.name as vn -> tgt.contributor as vt, vt.type = 'author' then Contributor(vs, vt);
    }`;

    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.source).toHaveLength(2);
  });

  test('Multiple rule targets', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.author as vs -> tgt.contributor as vt, vt.type = 'author' then Contributor(vs, vt);
    }`;

    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.target).toHaveLength(2);
  });

  test('ValueSet R4 to R3', () => {
    // Source: https://hl7.org/fhir/valueset-version-maps.html#4.9.17.2
    const input = `map "http://hl7.org/fhir/StructureMap/ValueSet4to3" = "R4 to R3 Conversion for ValueSet"

    uses "http://hl7.org/fhir/StructureDefinition/ValueSet" alias ValueSet as source
    uses "http://hl7.org/fhir/3.0/StructureDefinition/ValueSet" alias ValueSetR3 as target

    imports "http://hl7.org/fhir/StructureMap/*4to3"

    group ValueSet(source src : ValueSet, target tgt : ValueSetR3) extends DomainResource <<type+>> {
      src.url -> tgt.url;
      src.identifier -> tgt.identifier;
      src.version -> tgt.version;
      src.name -> tgt.name;
      src.title -> tgt.title;
      src.status -> tgt.status;
      src.experimental -> tgt.experimental;
      src.date -> tgt.date;
      src.publisher -> tgt.publisher;
      src.contact -> tgt.contact;
      src.description -> tgt.description;
      src.useContext -> tgt.useContext;
      src.jurisdiction -> tgt.jurisdiction;
      src.immutable -> tgt.immutable;
      src.purpose -> tgt.purpose;
      src.copyright -> tgt.copyright;
      src.extension as ext where url = 'http://hl7.org/fhir/3.0/StructureDefinition/extension-ValueSet.extensible' then {
        ext.value : boolean as vs0 -> tgt.extensible = vs0 "extensible2";
      } "extensible";
      src.compose as vs0 -> tgt.compose as vt0 then compose(vs0, vt0);
      src.expansion as vs0 -> tgt.expansion as vt0 then expansion(vs0, vt0);
    }

    group compose(source src, target tgt) extends BackboneElement {
      src.lockedDate -> tgt.lockedDate;
      src.inactive -> tgt.inactive;
      src.include as vs0 -> tgt.include as vt0 then include(vs0, vt0);
      src.exclude as vs0 -> tgt.exclude as vt0 then include(vs0, vt0);
    }

    group include(source src, target tgt) extends BackboneElement {
      src.system -> tgt.system;
      src.version -> tgt.version;
      src.concept as vs0 -> tgt.concept as vt0 then concept(vs0, vt0);
      src.filter as vs0 -> tgt.filter as vt0 then filter(vs0, vt0);
      src.valueSet -> tgt.valueSet;
    }

    group concept(source src, target tgt) extends BackboneElement {
      src.code -> tgt.code;
      src.display -> tgt.display;
      src.designation as vs0 -> tgt.designation as vt0 then designation(vs0, vt0);
    }

    group designation(source src, target tgt) extends BackboneElement {
      src.language -> tgt.language;
      src.use -> tgt.use;
      src.value -> tgt.value;
    }

    group filter(source src, target tgt) extends BackboneElement {
      src.property -> tgt.property;
      src.op -> tgt.op;
      src.value -> tgt.value;
    }

    group expansion(source src, target tgt) extends BackboneElement {
      src.identifier -> tgt.identifier;
      src.timestamp -> tgt.timestamp;
      src.total -> tgt.total;
      src.offset -> tgt.offset;
      src.parameter as vs0 -> tgt.parameter as vt0 then parameter(vs0, vt0);
      src.contains as vs0 -> tgt.contains as vt0 then contains(vs0, vt0);
    }

    group parameter(source src, target tgt) extends BackboneElement {
      src.name -> tgt.name;
      src.value : string as vs0 -> tgt.value = create('string') as vt0 then string(vs0, vt0) "valueString";
      src.value : boolean as vs0 -> tgt.value = create('boolean') as vt0 then boolean(vs0, vt0) "valueBoolean";
      src.value : integer as vs0 -> tgt.value = create('integer') as vt0 then integer(vs0, vt0) "valueInteger";
      src.value : decimal as vs0 -> tgt.value = create('decimal') as vt0 then decimal(vs0, vt0) "valueDecimal";
      src.value : url as vs0 -> tgt.value = create('url') as vt0 then url(vs0, vt0) "valueUrl";
      src.value : code as vs0 -> tgt.value = create('code') as vt0 then code(vs0, vt0) "valueCode";
      src.value : dateTime as vs0 -> tgt.value = create('dateTime') as vt0 then dateTime(vs0, vt0) "valueDateTime";
    }

    group contains(source src, target tgt) extends BackboneElement {
      src.system -> tgt.system;
      src.abstract -> tgt.abstract;
      src.inactive -> tgt.inactive;
      src.version -> tgt.version;
      src.code -> tgt.code;
      src.display -> tgt.display;
      src.designation as vs0 -> tgt.designation as vt0 then designation(vs0, vt0);
      src.contains as vs0 -> tgt.contains as vt0 then contains(vs0, vt0);
    }
    `;

    // Generated with org.hl7.fhir.r4.utils.StructureMapUtilities.parse
    const expected = {
      resourceType: 'StructureMap',
      url: 'http://hl7.org/fhir/StructureMap/ValueSet4to3',
      name: 'R4 to R3 Conversion for ValueSet',
      structure: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/ValueSet',
          mode: 'source',
          alias: 'ValueSet',
        },
        {
          url: 'http://hl7.org/fhir/3.0/StructureDefinition/ValueSet',
          mode: 'target',
          alias: 'ValueSetR3',
        },
      ],
      import: ['http://hl7.org/fhir/StructureMap/*4to3'],
      group: [
        {
          name: 'ValueSet',
          extends: 'DomainResource',
          typeMode: 'type-and-types',
          input: [
            {
              name: 'src',
              type: 'ValueSet',
              mode: 'source',
            },
            {
              name: 'tgt',
              type: 'ValueSetR3',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'url',
              source: [
                {
                  context: 'src',
                  element: 'url',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'url',
                },
              ],
            },
            {
              name: 'identifier',
              source: [
                {
                  context: 'src',
                  element: 'identifier',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'identifier',
                },
              ],
            },
            {
              name: 'version',
              source: [
                {
                  context: 'src',
                  element: 'version',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'version',
                },
              ],
            },
            {
              name: 'name',
              source: [
                {
                  context: 'src',
                  element: 'name',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'name',
                },
              ],
            },
            {
              name: 'title',
              source: [
                {
                  context: 'src',
                  element: 'title',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'title',
                },
              ],
            },
            {
              name: 'status',
              source: [
                {
                  context: 'src',
                  element: 'status',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'status',
                },
              ],
            },
            {
              name: 'experimental',
              source: [
                {
                  context: 'src',
                  element: 'experimental',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'experimental',
                },
              ],
            },
            {
              name: 'date',
              source: [
                {
                  context: 'src',
                  element: 'date',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'date',
                },
              ],
            },
            {
              name: 'publisher',
              source: [
                {
                  context: 'src',
                  element: 'publisher',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'publisher',
                },
              ],
            },
            {
              name: 'contact',
              source: [
                {
                  context: 'src',
                  element: 'contact',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'contact',
                },
              ],
            },
            {
              name: 'description',
              source: [
                {
                  context: 'src',
                  element: 'description',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'description',
                },
              ],
            },
            {
              name: 'useContext',
              source: [
                {
                  context: 'src',
                  element: 'useContext',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'useContext',
                },
              ],
            },
            {
              name: 'jurisdiction',
              source: [
                {
                  context: 'src',
                  element: 'jurisdiction',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'jurisdiction',
                },
              ],
            },
            {
              name: 'immutable',
              source: [
                {
                  context: 'src',
                  element: 'immutable',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'immutable',
                },
              ],
            },
            {
              name: 'purpose',
              source: [
                {
                  context: 'src',
                  element: 'purpose',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'purpose',
                },
              ],
            },
            {
              name: 'copyright',
              source: [
                {
                  context: 'src',
                  element: 'copyright',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'copyright',
                },
              ],
            },
            {
              name: 'extensible',
              source: [
                {
                  context: 'src',
                  element: 'extension',
                  variable: 'ext',
                  condition: "url = 'http://hl7.org/fhir/3.0/StructureDefinition/extension-ValueSet.extensible'",
                },
              ],
              rule: [
                {
                  name: 'extensible2',
                  source: [
                    {
                      context: 'ext',
                      type: 'boolean',
                      element: 'value',
                      variable: 'vs0',
                    },
                  ],
                  target: [
                    {
                      context: 'tgt',
                      contextType: 'variable',
                      element: 'extensible',
                      transform: 'copy',
                      parameter: [
                        {
                          valueId: 'vs0',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'compose',
              source: [
                {
                  context: 'src',
                  element: 'compose',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'compose',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'compose',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'expansion',
              source: [
                {
                  context: 'src',
                  element: 'expansion',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'expansion',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'expansion',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
          ],
        },
        {
          name: 'compose',
          extends: 'BackboneElement',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              mode: 'source',
            },
            {
              name: 'tgt',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'lockedDate',
              source: [
                {
                  context: 'src',
                  element: 'lockedDate',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'lockedDate',
                },
              ],
            },
            {
              name: 'inactive',
              source: [
                {
                  context: 'src',
                  element: 'inactive',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'inactive',
                },
              ],
            },
            {
              name: 'include',
              source: [
                {
                  context: 'src',
                  element: 'include',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'include',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'include',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'exclude',
              source: [
                {
                  context: 'src',
                  element: 'exclude',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'exclude',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'include',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
          ],
        },
        {
          name: 'include',
          extends: 'BackboneElement',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              mode: 'source',
            },
            {
              name: 'tgt',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'system',
              source: [
                {
                  context: 'src',
                  element: 'system',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'system',
                },
              ],
            },
            {
              name: 'version',
              source: [
                {
                  context: 'src',
                  element: 'version',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'version',
                },
              ],
            },
            {
              name: 'concept',
              source: [
                {
                  context: 'src',
                  element: 'concept',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'concept',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'concept',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'filter',
              source: [
                {
                  context: 'src',
                  element: 'filter',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'filter',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'filter',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'valueSet',
              source: [
                {
                  context: 'src',
                  element: 'valueSet',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'valueSet',
                },
              ],
            },
          ],
        },
        {
          name: 'concept',
          extends: 'BackboneElement',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              mode: 'source',
            },
            {
              name: 'tgt',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'code',
              source: [
                {
                  context: 'src',
                  element: 'code',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'code',
                },
              ],
            },
            {
              name: 'display',
              source: [
                {
                  context: 'src',
                  element: 'display',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'display',
                },
              ],
            },
            {
              name: 'designation',
              source: [
                {
                  context: 'src',
                  element: 'designation',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'designation',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'designation',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
          ],
        },
        {
          name: 'designation',
          extends: 'BackboneElement',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              mode: 'source',
            },
            {
              name: 'tgt',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'language',
              source: [
                {
                  context: 'src',
                  element: 'language',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'language',
                },
              ],
            },
            {
              name: 'use',
              source: [
                {
                  context: 'src',
                  element: 'use',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'use',
                },
              ],
            },
            {
              name: 'value',
              source: [
                {
                  context: 'src',
                  element: 'value',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                },
              ],
            },
          ],
        },
        {
          name: 'filter',
          extends: 'BackboneElement',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              mode: 'source',
            },
            {
              name: 'tgt',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'property',
              source: [
                {
                  context: 'src',
                  element: 'property',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'property',
                },
              ],
            },
            {
              name: 'op',
              source: [
                {
                  context: 'src',
                  element: 'op',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'op',
                },
              ],
            },
            {
              name: 'value',
              source: [
                {
                  context: 'src',
                  element: 'value',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                },
              ],
            },
          ],
        },
        {
          name: 'expansion',
          extends: 'BackboneElement',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              mode: 'source',
            },
            {
              name: 'tgt',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'identifier',
              source: [
                {
                  context: 'src',
                  element: 'identifier',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'identifier',
                },
              ],
            },
            {
              name: 'timestamp',
              source: [
                {
                  context: 'src',
                  element: 'timestamp',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'timestamp',
                },
              ],
            },
            {
              name: 'total',
              source: [
                {
                  context: 'src',
                  element: 'total',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'total',
                },
              ],
            },
            {
              name: 'offset',
              source: [
                {
                  context: 'src',
                  element: 'offset',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'offset',
                },
              ],
            },
            {
              name: 'parameter',
              source: [
                {
                  context: 'src',
                  element: 'parameter',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'parameter',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'parameter',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'contains',
              source: [
                {
                  context: 'src',
                  element: 'contains',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'contains',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'contains',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
          ],
        },
        {
          name: 'parameter',
          extends: 'BackboneElement',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              mode: 'source',
            },
            {
              name: 'tgt',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'name',
              source: [
                {
                  context: 'src',
                  element: 'name',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'name',
                },
              ],
            },
            {
              name: 'valueString',
              source: [
                {
                  context: 'src',
                  type: 'string',
                  element: 'value',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                  variable: 'vt0',
                  parameter: [
                    {
                      valueString: 'string',
                    },
                  ],
                },
              ],
              dependent: [
                {
                  name: 'string',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'valueBoolean',
              source: [
                {
                  context: 'src',
                  type: 'boolean',
                  element: 'value',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                  variable: 'vt0',
                  parameter: [
                    {
                      valueString: 'boolean',
                    },
                  ],
                },
              ],
              dependent: [
                {
                  name: 'boolean',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'valueInteger',
              source: [
                {
                  context: 'src',
                  type: 'integer',
                  element: 'value',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                  variable: 'vt0',
                  parameter: [
                    {
                      valueString: 'integer',
                    },
                  ],
                },
              ],
              dependent: [
                {
                  name: 'integer',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'valueDecimal',
              source: [
                {
                  context: 'src',
                  type: 'decimal',
                  element: 'value',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                  variable: 'vt0',
                  parameter: [
                    {
                      valueString: 'decimal',
                    },
                  ],
                },
              ],
              dependent: [
                {
                  name: 'decimal',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'valueUrl',
              source: [
                {
                  context: 'src',
                  type: 'url',
                  element: 'value',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                  variable: 'vt0',
                  parameter: [
                    {
                      valueString: 'url',
                    },
                  ],
                },
              ],
              dependent: [
                {
                  name: 'url',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'valueCode',
              source: [
                {
                  context: 'src',
                  type: 'code',
                  element: 'value',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                  variable: 'vt0',
                  parameter: [
                    {
                      valueString: 'code',
                    },
                  ],
                },
              ],
              dependent: [
                {
                  name: 'code',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'valueDateTime',
              source: [
                {
                  context: 'src',
                  type: 'dateTime',
                  element: 'value',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'value',
                  variable: 'vt0',
                  parameter: [
                    {
                      valueString: 'dateTime',
                    },
                  ],
                },
              ],
              dependent: [
                {
                  name: 'dateTime',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
          ],
        },
        {
          name: 'contains',
          extends: 'BackboneElement',
          typeMode: 'none',
          input: [
            {
              name: 'src',
              mode: 'source',
            },
            {
              name: 'tgt',
              mode: 'target',
            },
          ],
          rule: [
            {
              name: 'system',
              source: [
                {
                  context: 'src',
                  element: 'system',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'system',
                },
              ],
            },
            {
              name: 'abstract',
              source: [
                {
                  context: 'src',
                  element: 'abstract',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'abstract',
                },
              ],
            },
            {
              name: 'inactive',
              source: [
                {
                  context: 'src',
                  element: 'inactive',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'inactive',
                },
              ],
            },
            {
              name: 'version',
              source: [
                {
                  context: 'src',
                  element: 'version',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'version',
                },
              ],
            },
            {
              name: 'code',
              source: [
                {
                  context: 'src',
                  element: 'code',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'code',
                },
              ],
            },
            {
              name: 'display',
              source: [
                {
                  context: 'src',
                  element: 'display',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'display',
                },
              ],
            },
            {
              name: 'designation',
              source: [
                {
                  context: 'src',
                  element: 'designation',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'designation',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'designation',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
            {
              name: 'contains',
              source: [
                {
                  context: 'src',
                  element: 'contains',
                  variable: 'vs0',
                },
              ],
              target: [
                {
                  context: 'tgt',
                  contextType: 'variable',
                  element: 'contains',
                  variable: 'vt0',
                },
              ],
              dependent: [
                {
                  name: 'contains',
                  variable: ['vs0', 'vt0'],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(parseMappingLanguage(input)).toMatchObject(expected);
  });

  test('Unexpected token', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial
    foo
    `;

    expect(() => parseMappingLanguage(input)).toThrow('Unexpected token: foo');
  });

  test('Multiple imports', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial
    imports "http://hl7.org/fhir/StructureMap/x"
    imports "http://hl7.org/fhir/StructureMap/y"
    imports "http://hl7.org/fhir/StructureMap/z"
    `;

    const result = parseMappingLanguage(input);
    expect(result.import).toMatchObject([
      'http://hl7.org/fhir/StructureMap/x',
      'http://hl7.org/fhir/StructureMap/y',
      'http://hl7.org/fhir/StructureMap/z',
    ]);
  });

  test('Evaluate FHIRPath', () => {
    const input = `map "http://test.com" = test
    group example(source src, target tgt) {
      src -> tgt.value = src.value + '_test';
    }`;
    const result = parseMappingLanguage(input);
    expect(result.group?.[0]?.rule?.[0]?.target?.[0]?.transform).toBe('evaluate');
    expect(result.group?.[0]?.rule?.[0]?.target?.[0]?.parameter?.[0]?.valueString).toBe("src.value + '_test'");
  });

  test('CCDA ConceptMaps', () => {
    const input = `
    map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial

    conceptmap "cm-v3-administrative-gender" {
      prefix s = "http://terminology.hl7.org/ValueSet/v3-AdministrativeGender"
      prefix t = "http://hl7.org/fhir/ValueSet/administrative-gender"

      s:M == t:male
      s:F == t:female
    }

    conceptmap "addressUse" {
      prefix s = "http://terminology.hl7.org/ValueSet/v3-AddressUse"
      prefix t = "http://hl7.org/fhir/valueset-address-use.html"

      s:"H" == t:"home" // home address -> home
      s:"HP" == t: "home" // primary home -> home, http://hl7.org/fhir/v3/AddressUse/cs.html
      s:"HV" == t: "home" // vacation home	 -> home, http://hl7.org/fhir/v3/AddressUse/cs.html
    }

    group tutorial(source src : TLeft, target tgt : TRight) {
      src.a as a log "x" -> tgt.a = a "rule_a";
    }`;

    const result = parseMappingLanguage(input);
    expect(result.contained).toHaveLength(2);
    expect(result.contained).toMatchObject([
      {
        resourceType: 'ConceptMap',
        status: 'active',
        url: 'cm-v3-administrative-gender',
        group: [
          {
            source: 'http://terminology.hl7.org/ValueSet/v3-AdministrativeGender',
            target: 'http://hl7.org/fhir/ValueSet/administrative-gender',
            element: [
              { code: 'M', target: [{ code: 'male' }] },
              { code: 'F', target: [{ code: 'female' }] },
            ],
          },
        ],
      },
      {
        resourceType: 'ConceptMap',
        status: 'active',
        url: 'addressUse',
        group: [
          {
            source: 'http://terminology.hl7.org/ValueSet/v3-AddressUse',
            target: 'http://hl7.org/fhir/valueset-address-use.html',
            element: [
              { code: 'H', target: [{ code: 'home' }] },
              { code: 'HP', target: [{ code: 'home' }] },
              { code: 'HV', target: [{ code: 'home' }] },
            ],
          },
        ],
      },
    ]);
  });

  test.skip('C-CDA mapping file', () => {
    const mapFileName = 'C:\\Users\\cody\\dev\\cda-fhir-maps\\input\\maps\\CdaToBundle.map';
    const mapFileContents = readFileSync(mapFileName, 'utf8');
    const structureMap = parseMappingLanguage(mapFileContents);
    expect(structureMap).toBeTruthy();
  });
});
