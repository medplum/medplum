// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Bundle, ElementDefinition, StructureDefinition } from '@medplum/fhirtypes';
import { getDataType, indexStructureDefinitionBundle } from './types';
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
  // A minimal XML logical model in the style of the HL7 CDA StructureDefinitions
  const base = 'http://example.com/StructureDefinition/';
  const attr: Partial<ElementDefinition> = { representation: ['xmlAttr'], type: [{ code: 'code' }] };

  function logicalModel(name: string, elements: Partial<ElementDefinition>[]): StructureDefinition {
    return {
      resourceType: 'StructureDefinition',
      url: base + name,
      name,
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

  const models = [
    logicalModel('ST', [
      { path: 'nullFlavor', ...attr },
      { path: 'xmlText', representation: ['xmlText'], type: [{ code: 'string' }] },
    ]),
    logicalModel('AD', [
      {
        path: 'item',
        max: '*',
        extension: [{ url: 'http://hl7.org/fhir/tools/StructureDefinition/xml-choice-group', valueBoolean: true }],
        type: [{ code: 'http://hl7.org/fhir/StructureDefinition/Base' }],
      },
      { path: 'item.city', type: [{ code: base + 'ST' }] },
      { path: 'item.streetAddressLine', type: [{ code: base + 'ST' }] },
    ]),
    logicalModel('Doc', [
      { path: 'classCode', ...attr },
      {
        path: 'typeCode',
        ...attr,
        extension: [{ url: 'http://hl7.org/fhir/tools/StructureDefinition/xml-name', valueString: 'type' }],
      },
      { path: 'title', type: [{ code: base + 'ST' }] },
      {
        path: 'raceCode',
        max: '*',
        extension: [
          { url: 'http://hl7.org/fhir/tools/StructureDefinition/xml-namespace', valueUri: 'urn:hl7-org:sdtc' },
        ],
        type: [{ code: base + 'ST' }],
      },
      { path: 'addr', type: [{ code: base + 'AD' }] },
      { path: 'value', max: '*', type: [{ code: base + 'ST' }, { code: base + 'AD' }] },
      { path: 'text', representation: ['cdaText'], type: [{ code: base + 'ST' }] },
      { path: 'part', max: '*', type: [{ code: 'http://hl7.org/fhir/StructureDefinition/Base' }] },
      { path: 'part.name', type: [{ code: base + 'ST' }] },
    ]),
  ];

  test('Loads with logical element names', () => {
    indexStructureDefinitionBundle(structuredClone(models));
    const doc = getDataType(base + 'Doc');
    expect(Object.keys(doc.elements)).toEqual([
      'classCode',
      'typeCode',
      'title',
      'raceCode',
      'addr',
      'value',
      'text',
      'part',
    ]);
    // Inner types are named by type URL and path, so they cannot collide with FHIR types
    expect(doc.elements.part.type[0].code).toBe(base + 'Doc#part');
    expect(getLogicalTypeName(base + 'Doc#part')).toBe('DocPart');
  });

  test('XML property names', () => {
    // Reload under new URLs, since loaded types are cached by URL
    const xmlModels = JSON.parse(JSON.stringify(models).replaceAll(base, base + 'xml/')) as StructureDefinition[];
    indexStructureDefinitionBundle(xmlModels, { xmlPropertyNames: true });

    const doc = getDataType(base + 'xml/Doc');
    expect(Object.keys(doc.elements)).toEqual([
      '@_classCode',
      '@_type',
      'title',
      'sdtc:raceCode',
      'addr',
      'value',
      'text',
      'part',
    ]);
    // Choice group members appear directly in the XML, any number of times
    const ad = getDataType(base + 'xml/AD');
    expect(Object.keys(ad.elements)).toEqual(['city', 'streetAddressLine']);
    expect(ad.elements.city.isArray).toBe(true);

    const result = generateTypeScriptDefinition(doc, { logicalTypePrefix: 'X' }) as string;
    expect(result).toContain('export interface XDoc {');
    expect(result).toContain("'@_xsi:type'?: string;");
    // Attributes are strings in parsed XML, whatever their logical type
    expect(result).toContain("'@_classCode'?: string;");
    expect(result).toContain("'@_type'?: string;");
    // Text-only elements parse to plain strings
    expect(result).toContain('title?: (XST | string);');
    expect(result).toContain("'sdtc:raceCode'?: (XST | string)[];");
    expect(result).toContain('value?: (XST | string | XAD)[];');
    expect(result).toContain('text?: string | Record<string, unknown>;');
    expect(result).toContain('part?: XDocPart[];');
    expect(result).toContain('export interface XDocPart {');

    const st = generateTypeScriptDefinition(getDataType(base + 'xml/ST'), { logicalTypePrefix: 'X' }) as string;
    expect(st).toContain("'#text'?: string;");
  });
});
