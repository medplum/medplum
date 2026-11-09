// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Bundle, ElementDefinition, StructureDefinition } from '@medplum/fhirtypes';
import { getDataType, indexStructureDefinitionBundle, tryGetProfile } from './types';
import { generateTypeScriptDefinition, generateTypeScriptDefinitions, getLogicalTypeName } from './typescript';

describe('generateTypeScriptDefinition', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Base resource', () => {
    const result = generateTypeScriptDefinition(getDataType('Patient'), {
      getValueSetValues: (url) =>
        url.startsWith('http://hl7.org/fhir/ValueSet/administrative-gender') ? ['male', 'female'] : [],
    });
    expect(result).toContain("import type { Address } from './Address.d.ts';");
    expect(result).toContain('export interface Patient {');
    expect(result).toContain("readonly resourceType: 'Patient';");
    expect(result).toContain("gender?: 'male' | 'female';");
    expect(result).toContain('generalPractitioner?: Reference<Organization | Practitioner | PractitionerRole>[];');
    expect(result).toContain('export interface PatientContact {');
    expect(result).toContain('export type PatientDeceased = boolean | string;');
  });

  test('Profiles', () => {
    const files = generateTypeScriptDefinitions(
      readJson('fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json') as StructureDefinition[]
    );
    expect(files['index.d.ts']).toContain("export type { USCorePatientProfile } from './USCorePatientProfile.d.ts';");

    const patient = files['USCorePatientProfile.d.ts'];
    expect(patient).toContain('import type { Address, ');
    expect(patient).toContain("'@medplum/fhirtypes';");
    expect(patient).not.toContain('.d.ts');
    expect(patient).toContain('export interface USCorePatientProfile {');
    expect(patient).toContain("readonly resourceType: 'Patient';");
    expect(patient).toContain('identifier: Identifier[];');
    // Unresolved bindings fall back to the base property type
    expect(patient).toContain("gender: NonNullable<Patient['gender']>;");
    // Inner types are renamed so they don't conflict with the base types
    expect(patient).toContain('contact?: USCorePatientProfileContact[];');
    expect(patient).toContain('export interface USCorePatientProfileContact {');
    expect(patient).toContain("gender?: NonNullable<PatientContact['gender']>;");
    // Constraints on data type elements (e.g. "identifier.system") are not flattened into the resource
    expect(patient).not.toMatch(/^ {2}system/m);

    const bloodPressure = files['USCoreBloodPressureProfile.d.ts'];
    expect(bloodPressure).toContain("readonly resourceType: 'Observation';");
    expect(bloodPressure).toContain('subject: Reference<Patient>;');
    // References to profiles that are not loaded fall back to the base property type
    expect(bloodPressure).toContain("hasMember?: NonNullable<Observation['hasMember']>;");
    // Choice types are restricted to the profile's types
    expect(bloodPressure).toContain('effectiveDateTime?: string;');
    expect(bloodPressure).toContain('effectivePeriod?: Period;');
    expect(bloodPressure).not.toContain('effectiveInstant');

    // Profiles can restrict arrays to 0..1, but they are still arrays in JSON
    expect(files['USCoreImplantableDeviceProfile.d.ts']).toContain(
      'udiCarrier?: USCoreImplantableDeviceProfileUdiCarrier[];'
    );
  });

  test('No elements', () => {
    expect(generateTypeScriptDefinition({ name: 'Empty', type: 'Empty', elements: {} } as any)).toBeUndefined();
  });
});

describe('Logical models', () => {
  const base = 'http://example.com/StructureDefinition/';
  const attr: Partial<ElementDefinition> = { representation: ['xmlAttr'], type: [{ code: 'code' }] };
  const sdtc = [{ url: 'http://hl7.org/fhir/tools/StructureDefinition/xml-namespace', valueUri: 'urn:hl7-org:sdtc' }];
  const choiceGroup = [{ url: 'http://hl7.org/fhir/tools/StructureDefinition/xml-choice-group', valueBoolean: true }];
  const baseType = [{ code: 'http://hl7.org/fhir/StructureDefinition/Base' }];

  function logicalModel(
    name: string,
    elements: Partial<ElementDefinition>[],
    options: { sdName?: string; xmlNamespace?: string } = {}
  ): StructureDefinition {
    return {
      resourceType: 'StructureDefinition',
      extension: options.xmlNamespace
        ? [{ url: 'http://hl7.org/fhir/tools/StructureDefinition/xml-namespace', valueUri: options.xmlNamespace }]
        : undefined,
      url: base + name,
      name: options.sdName ?? name,
      status: 'active',
      kind: 'logical',
      abstract: false,
      type: base + name,
      snapshot: {
        element: [
          { path: name, min: 1, max: '*' },
          ...elements.map((e) => ({ min: 0, max: '1', ...e, path: `${name}.${e.path}` })),
        ],
      },
    };
  }

  test('Logical model', () => {
    // Not an XML format (no XML namespace or xml-* extensions), so elements keep their logical names, even
    // when marked as XML attributes, as FHIR's own StructureDefinitions mark Element.id
    const model = logicalModel(
      'Plain',
      [
        { path: 'id', representation: ['xmlAttr'], type: [{ code: 'string' }] },
        { path: 'code', type: [{ code: 'code' }] },
        { path: 'part', max: '*', type: baseType },
        { path: 'part.name', type: [{ code: 'string' }] },
        { path: 'otherPart', contentReference: '#Plain.part' },
      ],
      { sdName: 'Plain-Model' }
    );
    indexStructureDefinitionBundle([model]);

    const plain = getDataType(base + 'Plain');
    expect(plain.xmlPropertyNames).toBeUndefined();
    expect(Object.keys(plain.elements)).toEqual(['id', 'code', 'part', 'otherPart']);
    // Inner types are named by type URL and path, so they cannot collide with FHIR types
    expect(plain.elements.part.type[0].code).toBe(base + 'Plain#part');
    expect(plain.elements.otherPart.type[0].code).toBe(base + 'Plain#part');

    // Type names are identifiers, whether declared or referenced
    const result = generateTypeScriptDefinition(plain, { logicalTypePrefix: 'X' }) as string;
    expect(result).toContain('export interface XPlain_Model {');
    expect(result).toContain('part?: XPlain_ModelPart[];');
    // Content references have the cardinality of the referenced element
    expect(result).toContain('otherPart?: XPlain_ModelPart[];');
    expect(result).toContain('export interface XPlain_ModelPart {');
    expect(getLogicalTypeName(base + 'Plain#part')).toBe('Plain_ModelPart');
  });

  describe('XML logical model', () => {
    // A minimal XML logical model in the style of the HL7 CDA StructureDefinitions
    const v3 = { xmlNamespace: 'urn:hl7-org:v3' };
    const models = [
      logicalModel(
        'ST',
        [
          { path: 'nullFlavor', ...attr },
          { path: 'xmlText', representation: ['xmlText'], type: [{ code: 'string' }] },
        ],
        v3
      ),
      logicalModel(
        'AD',
        [
          { path: 'item', max: '*', extension: choiceGroup, type: baseType },
          { path: 'item.city', type: [{ code: base + 'ST' }] },
          { path: 'item.streetAddressLine', type: [{ code: base + 'ST' }] },
        ],
        v3
      ),
      logicalModel(
        'Doc',
        [
          { path: 'classCode', ...attr },
          {
            path: 'typeCode',
            ...attr,
            extension: [{ url: 'http://hl7.org/fhir/tools/StructureDefinition/xml-name', valueString: 'type' }],
          },
          { path: 'title', type: [{ code: base + 'ST' }] },
          { path: 'raceCode', max: '*', extension: sdtc, type: [{ code: base + 'ST' }] },
          { path: 'addr', type: [{ code: base + 'AD' }] },
          { path: 'value', max: '*', type: [{ code: base + 'ST' }, { code: base + 'AD' }] },
          { path: 'sdtcValue', extension: sdtc, type: [{ code: base + 'ST' }, { code: base + 'AD' }] },
          { path: 'text', representation: ['cdaText'], type: [{ code: base + 'ST' }] },
          { path: 'part', max: '*', type: baseType },
          { path: 'part.name', type: [{ code: base + 'ST' }] },
          // A choice group in an inner type
          { path: 'part.group', max: '*', extension: choiceGroup, type: baseType },
          { path: 'part.group.alias', extension: sdtc, type: [{ code: base + 'ST' }] },
        ],
        v3
      ),
    ];

    beforeAll(() => {
      indexStructureDefinitionBundle(models);
    });

    test('XML property names', () => {
      const doc = getDataType(base + 'Doc');
      expect(Object.keys(doc.elements)).toEqual([
        '@_classCode',
        '@_type',
        'title',
        'sdtc:raceCode',
        'addr',
        'value',
        'sdtc:sdtcValue',
        'text',
        'part',
      ]);
      // Choice group members appear directly in the XML, any number of times
      const ad = getDataType(base + 'AD');
      expect(Object.keys(ad.elements)).toEqual(['city', 'streetAddressLine']);
      expect(ad.elements.city.isArray).toBe(true);
      expect(Object.keys(getDataType(base + 'Doc#part').elements)).toEqual(['name', 'sdtc:alias']);
    });

    test('TypeScript definitions', () => {
      const result = generateTypeScriptDefinition(getDataType(base + 'Doc'), { logicalTypePrefix: 'X' }) as string;
      expect(result).toContain('export interface XDoc {');
      expect(result).toContain("'@_xsi:type'?: string;");
      // Attributes are strings in parsed XML, whatever their logical type
      expect(result).toContain("'@_classCode'?: string;");
      expect(result).toContain("'@_type'?: string;");
      // Text-only elements parse to plain strings
      expect(result).toContain('title?: (XST | string);');
      expect(result).toContain("'sdtc:raceCode'?: (XST | string)[];");
      expect(result).toContain('value?: (XST | string | XAD)[];');
      // Union aliases are the type of one value, named by the logical name
      expect(result).toContain('export type XDocValue = XST | string | XAD;');
      expect(result).toContain("'sdtc:sdtcValue'?: (XST | string | XAD);");
      expect(result).toContain('export type XDocSdtcValue = XST | string | XAD;');
      expect(result).toContain('text?: string | Record<string, unknown>;');
      expect(result).toContain('part?: XDocPart[];');
      expect(result).toContain('export interface XDocPart {');

      const st = generateTypeScriptDefinition(getDataType(base + 'ST'), { logicalTypePrefix: 'X' }) as string;
      expect(st).toContain("'#text'?: string;");
    });

    test('Profiles do not replace the base type', () => {
      const doc = getDataType(base + 'Doc');
      const profile: StructureDefinition = {
        ...logicalModel('Doc', [{ path: 'title', min: 1, type: [{ code: base + 'ST' }] }], v3),
        url: base + 'DocProfile',
        name: 'DocProfile',
        derivation: 'constraint',
      };
      indexStructureDefinitionBundle([profile]);
      expect(getDataType(base + 'Doc')).toBe(doc);
      expect(getDataType(base + 'Doc#part').elements['sdtc:alias']).toBeDefined();
      expect(tryGetProfile(base + 'DocProfile')?.elements.title.min).toBe(1);
    });

    test('Imports of union types', () => {
      // Reindexing keeps the XML property names, since they are a property of the model
      const files = generateTypeScriptDefinitions(models, { logicalTypePrefix: 'X' });
      expect(files['XDoc.d.ts']).toContain("import type { XAD } from './XAD.d.ts';");
      expect(files['XDoc.d.ts']).toContain("import type { XST } from './XST.d.ts';");
      expect(files['XDoc.d.ts']).toContain("'@_classCode'?: string;");
      expect(files['index.d.ts']).toContain("export type { XAD } from './XAD.d.ts';");
    });
  });
});
