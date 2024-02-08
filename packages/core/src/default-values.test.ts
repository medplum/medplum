import { USCoreStructureDefinitionList } from '@medplum/mock';
import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SlicingRules,
  getProfile,
  loadDataType,
} from './typeschema/types';
import { isPopulated } from './utils';
import { Observation, Patient, StructureDefinition } from '@medplum/fhirtypes';
import {
  applyDefaultValuesToElement,
  applyDefaultValuesToResource,
  applyDefaultValuesToElementWithVisitor,
  getDefaultValuesForNewSliceEntry,
} from './default-values';
import { HTTP_HL7_ORG } from './constants';

function isStructureDefinition(sd: any): sd is StructureDefinition {
  if (!isPopulated<StructureDefinition>(sd)) {
    return false;
  }
  return sd.resourceType === 'StructureDefinition';
}

function loadProfiles(profileUrls: string[]): void {
  const sds: StructureDefinition[] = profileUrls
    .map((profileUrl) => {
      return (USCoreStructureDefinitionList as StructureDefinition[]).find((sd) => sd.url === profileUrl);
    })
    .filter(isStructureDefinition);

  expect(sds.length).toEqual(profileUrls.length);

  for (const sd of sds) {
    loadDataType(sd, sd?.url);
  }
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

const DEBUG = false;

describe('apply default values', () => {
  describe('US Blood Pressure', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-blood-pressure`;
    const profileUrls = [profileUrl];

    let schema: InternalTypeSchema;

    beforeAll(() => {
      loadProfiles(profileUrls);
      schema = getProfile(profileUrl);
    });

    test('new Blood Pressure observation', async () => {
      // casting to avoid specifying any required (according to typescript) fields
      // since populating them is the point of the code being tested
      const resource: Observation = { resourceType: 'Observation' } as Observation;
      const withDefaults = applyDefaultValuesToResource(resource, schema, { debug: DEBUG });

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
    const profileUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
    const raceExtensionUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race';
    const profileUrls = [
      profileUrl,
      raceExtensionUrl,
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
    ];

    let schema: InternalTypeSchema;

    beforeAll(() => {
      loadProfiles(profileUrls);
      schema = getProfile(profileUrl);
    });

    test('new Patient has no fixed/pattern values', async () => {
      const resource: Patient = { resourceType: 'Patient' };
      const withDefaults = applyDefaultValuesToResource(resource, schema, { debug: DEBUG });

      expect(withDefaults).toStrictEqual({ resourceType: 'Patient' });
      // For now, a different object is returned by design
      expect(withDefaults).not.toBe(resource);
    });

    describe('fixed/pattern values within non-required extension slice entry', () => {
      test('new race extension entry', () => {
        const sliceSchema = getProfile(raceExtensionUrl);
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
  });
});
