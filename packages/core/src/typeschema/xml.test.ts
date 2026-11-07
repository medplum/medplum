// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Bundle } from '@medplum/fhirtypes';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { OperationOutcomeError } from '../outcomes';
import type { InternalTypeSchema } from './types';
import { getDataType, indexStructureDefinitionBundle } from './types';
import { validateResource, validateTypedValue } from './validation';

const CDA = 'http://hl7.org/cda/stds/core/StructureDefinition/';

// A CDA observation as fast-xml-parser parses it ("@_" attributes, "#text" content)
const OBSERVATION = {
  '@_classCode': 'OBS',
  '@_moodCode': 'EVN',
  '@_negationInd': 'false',
  templateId: [{ '@_root': '2.16.840.1.113883.10.20.22.4.27', '@_extension': '2014-06-09' }],
  id: { '@_root': '2.16.840.1.113883.19.5' },
  code: { '@_code': '8867-4', '@_codeSystem': '2.16.840.1.113883.6.1', '@_displayName': 'Heart rate' },
  // Text-only element
  text: 'Heart rate',
  // Empty element
  statusCode: '',
  effectiveTime: { low: { '@_value': '20240101120000-0500' } },
  value: { '@_xsi:type': 'PQ', '@_value': '72', '@_unit': '/min' },
  // Specialization of the declared type (CE for CD)
  interpretationCode: { '@_xsi:type': 'CE', '@_code': 'N', '@_codeSystem': '2.16.840.1.113883.5.83' },
  author: {
    time: { '@_value': '20240101' },
    assignedAuthor: {
      id: { '@_root': '2.16.840.1.113883.19.5' },
      // List attribute
      addr: { '@_use': 'HP WP', city: 'Anywhere', streetAddressLine: ['1 Main St', 'Apt 2'] },
    },
  },
};

function validate(value: object, type = 'Observation'): string[] {
  try {
    validateTypedValue({ type: CDA + type, value });
    return [];
  } catch (err) {
    if (err instanceof OperationOutcomeError) {
      return err.outcome.issue.map((i) => `${i.expression?.[0]}: ${i.details?.text}`);
    }
    throw err;
  }
}

// FHIR types that CDA types share names with (CDA Person, Observation) or declare as primitives (ts, st)
const FHIR_TYPES = ['Person', 'Observation', 'Organization', 'string', 'boolean', 'dateTime', 'code'];

describe('XML logical models', () => {
  const fhirSchemas = new Map<string, InternalTypeSchema>();

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const type of FHIR_TYPES) {
      fhirSchemas.set(type, getDataType(type));
    }
    indexStructureDefinitionBundle(readJson('fhir/cda/hl7.cda.uv.core-2.0.0-sd.json') as Bundle, {
      xmlPropertyNames: true,
    });
  });

  test('FHIR types are unchanged', () => {
    for (const type of FHIR_TYPES) {
      expect(getDataType(type)).toBe(fhirSchemas.get(type));
    }
    expect(() => validateResource({ resourceType: 'Person', name: [{ family: 'Smith' }] })).not.toThrow();
  });

  test('Valid parsed XML', () => {
    expect(validate(OBSERVATION)).toEqual([]);
  });

  test('Errors', () => {
    expect(
      validate({
        ...OBSERVATION,
        '@_negationInd': 'no',
        code: undefined,
        effectiveTime: { low: { '@_value': '2024-01-01' } },
        value: { '@_xsi:type': 'PQ', '@_value': 'seventy' },
        foo: {},
      })
    ).toEqual([
      'Observation.negationInd: Invalid boolean format',
      'Observation.code: Missing required property',
      'Observation.effectiveTime.low.value: Invalid dateTime format',
      'Observation.value[0].value: Invalid decimal format',
      'Observation.foo: Invalid additional element "foo"',
    ]);
  });

  test('xsi:type', () => {
    // Unknown type, and its attributes are not in the declared type
    expect(validate({ ...OBSERVATION, value: { '@_xsi:type': 'XQ', '@_value': '1' } })).toEqual([
      'Observation.value[0]: Unknown xsi:type "XQ"',
      'Observation.value[0].value: Invalid additional attribute "value"',
    ]);
    // Not a specialization of the declared type (CD)
    expect(validate({ ...OBSERVATION, code: { '@_xsi:type': 'PQ', '@_value': '1' } })).toEqual([
      'Observation.code: Invalid xsi:type "PQ" for this element',
    ]);
    // Validated as the specialization: unit is a PQ attribute, not a CD attribute
    expect(validate({ ...OBSERVATION, value: { '@_xsi:type': 'CD', '@_code': 'x', '@_unit': 'mg' } })).toEqual([
      'Observation.value[0].unit: Invalid additional attribute "unit"',
    ]);
  });

  test('Cardinality of parsed elements', () => {
    // Repeated single element
    expect(validate({ ...OBSERVATION, code: [OBSERVATION.code, OBSERVATION.code] })).toEqual([
      'Observation.code: Expected single value for property',
    ]);
    // Single elements wrapped in arrays, as XML parsers may do
    expect(validate({ ...OBSERVATION, code: [OBSERVATION.code], value: [OBSERVATION.value] })).toEqual([]);
  });

  test('Text content and constraints', () => {
    // Text in an element that has no text content
    expect(validate({ ...OBSERVATION, code: 'Heart rate' })).toEqual([
      'Observation.code.xmlText: Invalid text content',
    ]);
    // FHIRPath constraints use logical names: ST must have text or a nullFlavor
    expect(validate({ '#text': 'Title' }, 'ST')).toEqual([]);
    expect(validate({ '@_nullFlavor': 'UNK' }, 'ST')).toEqual([]);
    expect(validate({ '@_language': 'en-US' }, 'ST')).toEqual([
      'ST: Constraint text-null not met: xmlText and nullFlavor are mutually exclusive (one must be present)',
    ]);
  });

  test('FHIRPath on parsed XML', () => {
    const input = [{ type: CDA + 'Observation', value: OBSERVATION }];
    expect(evalFhirPathTyped('code.code', input).map((v) => v.value)).toEqual(['8867-4']);
    expect(evalFhirPathTyped('author.assignedAuthor.addr.use', input).map((v) => v.value)).toEqual(['HP', 'WP']);
    expect(evalFhirPathTyped('value.unit', input).map((v) => v.value)).toEqual(['/min']);
  });
});
