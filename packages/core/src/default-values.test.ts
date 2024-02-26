import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SlicingRules,
  loadDataType,
  tryGetProfile,
} from './typeschema/types';
import { isPopulated } from './utils';
import { Observation, Patient, StructureDefinition } from '@medplum/fhirtypes';
import {
  applyDefaultValuesToElement,
  applyDefaultValuesToResource,
  applyDefaultValuesToElementWithVisitor,
  getDefaultValuesForNewSliceEntry,
  applyFixedOrPatternValue,
} from './default-values';
import { HTTP_HL7_ORG } from './constants';
import { readJson } from '@medplum/definitions';

function isStructureDefinition(sd: any): sd is StructureDefinition {
  if (!isPopulated<StructureDefinition>(sd)) {
    return false;
  }
  return sd.resourceType === 'StructureDefinition';
}

function getSlicedElement(
  schema: InternalTypeSchema,
  slicedElementKey: string
): InternalSchemaElement & { slicing: SlicingRules } {
  const slicedElement = schema.elements[slicedElementKey];
  if (!isPopulated(slicedElement)) {
    fail(`Expected ${slicedElementKey} element to be defined`);
  }
  if (!isPopulated(slicedElement.slicing)) {
    fail(`Expected slicing to exist on ${slicedElementKey} element`);
  }

  return slicedElement as InternalSchemaElement & { slicing: SlicingRules };
}
function getSlice(schema: InternalTypeSchema, slicedElementKey: string, sliceName: string): SliceDefinition {
  const slicedElement = getSlicedElement(schema, slicedElementKey);
  const slice = slicedElement.slicing?.slices.find((s) => s.name === sliceName);
  if (!isPopulated(slice)) {
    fail(`Expected ${sliceName} slice to be defined`);
  }

  return slice;
}

describe('apply default values', () => {
  let USCoreStructureDefinitions: StructureDefinition[];
  beforeAll(() => {
    USCoreStructureDefinitions = readJson('fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');
  });

  function loadProfiles(profileUrls: string[]): void {
    const sds: StructureDefinition[] = profileUrls
      .map((profileUrl) => {
        return USCoreStructureDefinitions.find((sd) => sd.url === profileUrl);
      })
      .filter(isStructureDefinition);

    expect(sds.length).toEqual(profileUrls.length);

    for (const sd of sds) {
      loadDataType(sd, sd?.url);
    }
  }

  describe('US Blood Pressure', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-blood-pressure`;
    const profileUrls = [profileUrl];

    let schema: InternalTypeSchema;

    beforeAll(() => {
      loadProfiles(profileUrls);
      schema = tryGetProfile(profileUrl) as InternalTypeSchema;
      if (!schema) {
        fail(`Failed to load schema for ${profileUrl}`);
      }
    });

    test('new Blood Pressure observation', async () => {
      // casting to avoid specifying any required (according to typescript) fields
      // since populating them is the point of the code being tested
      const resource: Observation = { resourceType: 'Observation' } as Observation;
      const withDefaults = applyDefaultValuesToResource(resource, schema);

      // fixed values in Observation.component.value[x] excluded since value[x] itself is optional (min === 0)
      // In other words, { valueQuantity: {code: "mm[Hg]", system: "http://unitsofmeasure.org"} } should NOT be included
      // in either component
      expect(withDefaults).toEqual({
        resourceType: 'Observation',
        category: [
          {
            coding: [
              {
                code: 'vital-signs',
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '85354-9',
            },
          ],
        },
        component: [
          {
            code: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '8480-6',
                },
              ],
            },
          },
          {
            code: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '8462-4',
                },
              ],
            },
          },
        ],
      });
    });

    describe('required values within optional element', () => {
      test('value for Observation.component.value[x] in systolic slice', () => {
        const slice = getSlice(schema, 'component', 'systolic');
        expect(slice.elements['value[x]'].min).toEqual(0);

        const result = applyDefaultValuesToElement(Object.create(null), slice.elements, 'value[x]');
        expect(result).toEqual({ code: 'mm[Hg]', system: 'http://unitsofmeasure.org' });
      });

      test('value for Observation.component.value[x] in systolic slice with visitor', () => {
        const slice = getSlice(schema, 'component', 'systolic');
        const result = applyDefaultValuesToElementWithVisitor(
          undefined,
          'Observation.component.value[x]',
          slice.elements['value[x]'],
          slice.elements,
          schema
        );
        expect(result).toEqual({ code: 'mm[Hg]', system: 'http://unitsofmeasure.org' });
      });
    });
  });

  describe('US Core Patient', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const raceExtensionUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`;
    const ethnicityExtensionUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`;
    const profileUrls = [
      profileUrl,
      raceExtensionUrl,
      ethnicityExtensionUrl,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
    ];

    let schema: InternalTypeSchema;

    beforeAll(() => {
      loadProfiles(profileUrls);
      schema = tryGetProfile(profileUrl) as InternalTypeSchema;
      if (!schema) {
        fail(`Failed to load schema for ${profileUrl}`);
      }
    });

    test('new Patient has no fixed/pattern values', async () => {
      const resource: Patient = { resourceType: 'Patient' };
      const withDefaults = applyDefaultValuesToResource(resource, schema);

      expect(withDefaults).toEqual({ resourceType: 'Patient' });
      // For now, a different object is returned by design
      expect(withDefaults).not.toBe(resource);
    });

    test('HomerSimpsonUSCorePatient', async () => {
      const resource = getComplexUSCorePatient();
      const withDefaults = applyDefaultValuesToResource(resource, schema);

      const expected = getComplexUSCorePatient();

      // Prepare expected value
      // Expect stub values for a slice named 'text' to have been added for race and ethnicity extensions
      [ethnicityExtensionUrl, raceExtensionUrl].forEach((extUrl) => {
        const ext = expected.extension?.find((e) => e.url === extUrl);
        if (ext?.extension === undefined) {
          fail(`expected ${extUrl} extensions to exist`);
        }

        const textExt = ext.extension?.find((e) => e.url === 'text');
        expect(textExt).toBeUndefined();
        ext.extension.push({ url: 'text' });
      });

      expect(withDefaults).toEqual(expected);
    });

    describe('fixed/pattern values within non-required extension slice entry', () => {
      test('new race extension entry', () => {
        const sliceSchema = tryGetProfile(raceExtensionUrl) as InternalTypeSchema;
        if (!sliceSchema) {
          fail(`Failed to load schema for ${raceExtensionUrl}`);
        }
        const result = applyDefaultValuesToElement(Object.create(null), sliceSchema.elements);
        expect(result).toEqual({ url: raceExtensionUrl });
      });

      test('new race extension entry with visitor', () => {
        const slicedElement = getSlicedElement(schema, 'extension');
        const slice = getSlice(schema, 'extension', 'race');
        const result = getDefaultValuesForNewSliceEntry('extension', slice, slicedElement.slicing, schema);
        expect(result).toEqual({ url: raceExtensionUrl });
      });
    });

    test('applyFixedOrPatternValue with intermediate elements undefined', () => {
      const elem = schema.elements['identifier.value'];
      expect(elem).toBeDefined();
      expect(elem.fixed).toBeUndefined();
      // define a fake fixed value
      elem.fixed = { type: 'string', value: '42' };
      const result = applyFixedOrPatternValue({}, 'identifier.value', elem, schema.elements);
      expect(result).toEqual({ identifier: [{ value: '42' }] });

      delete elem.fixed;
      expect(elem.fixed).toBeUndefined();
    });

    test('applyFixedOrPatternValue with intermediate elements undefined', () => {
      const elem = schema.elements['identifier.value'];
      expect(elem).toBeDefined();
      expect(elem.fixed).toBeUndefined();
      // define a fake fixed value
      elem.fixed = { type: 'string', value: '42' };
      const result = applyFixedOrPatternValue({}, 'identifier.value', elem, schema.elements);
      expect(result).toEqual({ identifier: [{ value: '42' }] });

      delete elem.fixed;
      expect(elem.fixed).toBeUndefined();
    });

    test('applyFixedOrPatternValue on choice of types', () => {
      const key = 'multipleBirth[x]';
      const originalElem = schema.elements[key];
      expect(originalElem).toBeDefined();

      schema.elements[key] = {
        ...originalElem,
        fixed: {
          type: 'integer',
          value: 2,
        },
        type: [
          {
            code: 'integer',
            targetProfile: undefined,
            profile: undefined,
          },
        ],
      };

      const elem = schema.elements[key];
      const result = applyFixedOrPatternValue({}, key, elem, schema.elements);
      expect(result).toEqual({ multipleBirthInteger: 2 });

      schema.elements[key] = originalElem;
    });

    test('applyFixedOrPatternValue with non-empty array', () => {
      const key = 'maritalStatus';
      const elem = schema.elements[key];
      expect(elem).toBeDefined();
      expect(elem.pattern).toBeUndefined();

      // define a fake pattern value
      elem.pattern = {
        type: 'CodeableConcept',
        value: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
              code: 'UNK',
            },
          ],
        },
      };

      expect(applyFixedOrPatternValue({}, key, elem, schema.elements)).toEqual({
        maritalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus', code: 'UNK' }] },
      });

      expect(applyFixedOrPatternValue({ maritalStatus: { coding: [] } }, key, elem, schema.elements)).toEqual({
        maritalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus', code: 'UNK' }] },
      });

      expect(applyFixedOrPatternValue({ maritalStatus: { coding: [{}] } }, key, elem, schema.elements)).toEqual({
        maritalStatus: { coding: [{}] },
      });

      // degenerate case; maritalStatus should NOT be an array
      expect(applyFixedOrPatternValue({ maritalStatus: [] }, key, elem, schema.elements)).toEqual({
        maritalStatus: [],
      });

      // unexpected pattern value type
      elem.pattern = { ...elem.pattern, value: 42 };
      expect(applyFixedOrPatternValue({}, key, elem, schema.elements)).toEqual({});

      delete elem.pattern;
      expect(elem.pattern).toBeUndefined();
    });
  });
});

function getComplexUSCorePatient(): Patient {
  return {
    resourceType: 'Patient',
    id: '123',
    gender: 'male',
    meta: {
      versionId: '2',
      lastUpdated: '2020-01-02T00:00:00.000Z',
      author: {
        reference: 'Practitioner/123',
      },
    },
    identifier: [
      { system: 'abc', value: '123' },
      { system: 'def', value: '456' },
    ],
    active: true,
    birthDate: '1956-05-12',
    name: [
      {
        given: ['Homer'],
        family: 'Simpson',
      },
    ],
    extension: [
      {
        extension: [
          {
            valueCoding: {
              system: 'urn:oid:2.16.840.1.113883.6.238',
              code: '2106-3',
              display: 'White',
            },
            url: 'ombCategory',
          },
        ],
        url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`,
      },
      {
        extension: [
          {
            valueCoding: {
              system: 'urn:oid:2.16.840.1.113883.6.238',
              code: '2186-5',
              display: 'Not Hispanic or Latino',
            },
            url: 'ombCategory',
          },
        ],
        url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`,
      },
      {
        valueCode: 'M',
        url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
      },
      {
        valueCode: 'M',
        url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-sex`,
      },
      {
        valueCodeableConcept: {
          coding: [
            {
              system: 'urn:oid:2.16.840.1.113762.1.4.1021.32',
              code: 'M',
              display: 'Male',
            },
          ],
        },
        url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
      },
    ],
  };
}
