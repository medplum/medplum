import { USCoreStructureDefinitionList } from '@medplum/mock';
import { InternalTypeSchema, getProfile, loadDataType } from './typeschema/types';
import { isPopulated } from './utils';
import { Observation, Patient, StructureDefinition } from '@medplum/fhirtypes';
import {
  DefaultValueVisitor,
  SLICE_NAME_KEY,
  applyDefaultValuesToElement,
  applyDefaultValuesToResource,
  getDefaultValuesForElement,
  getDefaultValuesForNewSliceEntry,
} from './default-values';
import { HTTP_HL7_ORG } from './constants';
import USOccipitalFrontal from './__test__/StructureDefinition-head-occipital-frontal-circumference-percentile.json';
import { SchemaCrawler } from './schema-crawler';

// const medplum = new MockClient();

const DEBUG = false;
describe('applyDefaultValues', () => {
  describe('US Occipital Frontal', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/head-occipital-frontal-circumference-percentile`;
    let schema: InternalTypeSchema;

    beforeAll(() => {
      loadDataType(USOccipitalFrontal as StructureDefinition, USOccipitalFrontal.url);

      schema = getProfile(profileUrl);
    });

    test('empty Occipital Frontal', async () => {
      const resource = { resourceType: 'Observation' } as Observation;

      const withDefaults = applyDefaultValuesToResource(resource, schema, { debug: DEBUG });

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
              code: '8289-1',
              system: 'http://loinc.org',
            },
          ],
        },
      });
    });
  });

  function isStructureDefinition(sd: any): sd is StructureDefinition {
    if (!isPopulated<StructureDefinition>(sd)) {
      return false;
    }
    return sd.resourceType === 'StructureDefinition';
  }

  describe('US Blood Pressure', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-blood-pressure`;
    const profileUrls = [profileUrl];

    let schema: InternalTypeSchema;

    beforeAll(() => {
      const sds: StructureDefinition[] = profileUrls
        .map((profileUrl) => {
          return (USCoreStructureDefinitionList as StructureDefinition[]).find((sd) => sd.url === profileUrl);
        })
        .filter(isStructureDefinition);

      expect(sds.length).toEqual(profileUrls.length);

      for (const sd of sds) {
        loadDataType(sd, sd?.url);
      }

      schema = getProfile(profileUrl);
    });

    test('new Blood Pressure observation', async () => {
      // casting since purposefully don't want to specify any values
      const resource = { resourceType: 'Observation' } as Observation;

      const withDefaults = applyDefaultValuesToResource(resource, schema, { debug: DEBUG });

      // fixed values within value[x] purposefully excluded since value[x] itself is optional (min === 0)
      // i.e. valueQuantity: {code: "mm[Hg]", system: "http://unitsofmeasure.org"} should not be included
      // Observation.component.value[x].{code,system}
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
    describe('obtain required nested values on optional element', () => {
      test('value for systolic', () => {
        const slicedKey = 'component';
        const slicedElement = schema.elements[slicedKey];
        if (!isPopulated(slicedElement)) {
          fail(`Expected ${slicedKey} element to be defined`);
        }

        const slicing = slicedElement.slicing;
        if (!isPopulated(slicing)) {
          fail(`Expected slicing to exist on element`);
        }

        const sliceName = 'systolic';
        const slice = slicedElement.slicing?.slices.find((s) => s.name === sliceName);
        if (!isPopulated(slice)) {
          fail(`Expected ${sliceName} slice to be defined`);
        }

        const rootPath = 'Observation.component';
        const key = 'value[x]';
        const element = slice.elements[key];
        const visitor = new DefaultValueVisitor({ valueQuantity: {} }, rootPath, 'element');
        const crawler = new SchemaCrawler(schema, visitor, slice.elements);
        crawler.crawlElement(element, key, rootPath);
        const result = visitor.getDefaultValue();
        expect(result).toEqual({ valueQuantity: { code: 'mm[Hg]', system: 'http://unitsofmeasure.org' } });
      });

      test('value for systolic', () => {
        const slicedKey = 'component';
        const slicedElement = schema.elements[slicedKey];
        if (!isPopulated(slicedElement)) {
          fail(`Expected ${slicedKey} element to be defined`);
        }

        const slicing = slicedElement.slicing;
        if (!isPopulated(slicing)) {
          fail(`Expected slicing to exist on element`);
        }

        const sliceName = 'systolic';
        const slice = slicedElement.slicing?.slices.find((s) => s.name === sliceName);
        if (!isPopulated(slice)) {
          fail(`Expected ${sliceName} slice to be defined`);
        }

        // const rootPath = 'Observation.component';
        const key = 'value[x]';
        const element = slice.elements[key];

        // const profileUrl = slice.type?.[0]?.profile?.[0];
        // const typeSchema = getProfile(profileUrl);

        const result = getDefaultValuesForElement(
          undefined,
          'Observation.component.value[x]',
          key,
          element,
          slice.elements,
          schema
        );
        expect(result).toEqual({ code: 'mm[Hg]', system: 'http://unitsofmeasure.org' });
      });

      test('value for systolic', () => {
        const slicedKey = 'component';
        const slicedElement = schema.elements[slicedKey];
        if (!isPopulated(slicedElement)) {
          fail(`Expected ${slicedKey} element to be defined`);
        }

        const slicing = slicedElement.slicing;
        if (!isPopulated(slicing)) {
          fail(`Expected slicing to exist on element`);
        }

        const sliceName = 'systolic';
        const slice = slicedElement.slicing?.slices.find((s) => s.name === sliceName);
        if (!isPopulated(slice)) {
          fail(`Expected ${sliceName} slice to be defined`);
        }

        const key = 'value[x]';
        const result = applyDefaultValuesToElement(Object.create(null), key, slice.elements);
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
      const sds: StructureDefinition[] = profileUrls
        .map((profileUrl) => {
          return (USCoreStructureDefinitionList as StructureDefinition[]).find((sd) => sd.url === profileUrl);
        })
        .filter(isStructureDefinition);

      expect(sds.length).toEqual(profileUrls.length);

      for (const sd of sds) {
        loadDataType(sd, sd?.url);
      }

      schema = getProfile(profileUrl);
    });

    test('new Patient', async () => {
      const resource: Patient = { resourceType: 'Patient' };

      const withDefaults = applyDefaultValuesToResource(resource, schema, { debug: DEBUG });

      expect(withDefaults).toEqual({
        resourceType: 'Patient',
      });
    });

    describe('add slice value', () => {
      test('new race extension entry', () => {
        const key = 'extension';
        const slicedElement = schema.elements[key];
        if (!isPopulated(slicedElement)) {
          fail(`Expected ${key} element to be defined`);
        }

        const slicing = slicedElement.slicing;
        if (!isPopulated(slicing)) {
          fail(`Expected slicing to exist on element`);
        }

        const sliceName = 'race';
        const slice = slicedElement.slicing?.slices.find((s) => s.name === sliceName);
        if (!isPopulated(slice)) {
          fail(`Expected ${sliceName} slice to be defined`);
        }

        const visitor = new DefaultValueVisitor([{ [SLICE_NAME_KEY]: sliceName }], slicedElement.path, 'element');
        const crawler = new SchemaCrawler(schema, visitor);
        crawler.crawlSlice(key, slice, slicing);
        const result = visitor.getDefaultValue();
        expect(result).toEqual([
          {
            url: raceExtensionUrl,
          },
        ]);
      });

      test('new race extension entry', () => {
        const key = 'extension';
        const slicedElement = schema.elements[key];
        if (!isPopulated(slicedElement)) {
          fail(`Expected ${key} element to be defined`);
        }

        const slicing = slicedElement.slicing;
        if (!isPopulated(slicing)) {
          fail(`Expected slicing to exist on element`);
        }

        const sliceName = 'race';
        const slice = slicedElement.slicing?.slices.find((s) => s.name === sliceName);
        if (!isPopulated(slice)) {
          fail(`Expected ${sliceName} slice to be defined`);
        }

        const result = getDefaultValuesForNewSliceEntry(key, slice, slicing, schema);
        expect(result).toEqual([
          {
            url: raceExtensionUrl,
          },
        ]);
      });
    });
  });
});
