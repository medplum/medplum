import { USCoreStructureDefinitionList } from '@medplum/mock';
import { InternalTypeSchema, getProfile, loadDataType } from './typeschema/types';
import { isPopulated } from './utils';
import { Observation, Patient, StructureDefinition } from '@medplum/fhirtypes';
import { DefaultValueVisitor, applyDefaultValuesToResource } from './default-values';
import { HTTP_HL7_ORG } from './constants';
import USOccipitalFrontal from './__test__/StructureDefinition-head-occipital-frontal-circumference-percentile.json';
import { SchemaCrawler } from './schema-crawler';

// const medplum = new MockClient();

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

      const withDefaults = applyDefaultValuesToResource(resource, schema, { debug: true });

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
        subject: undefined,
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

      const withDefaults = applyDefaultValuesToResource(resource, schema, { debug: true });

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
        subject: undefined,
      });
    });
    describe('obtain required nested values on optional element', () => {
      test.only('value for systolic', () => {
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
        expect(result).toEqual([
          {
            uri: 'http://unitsofmeasure.org',
            code: 'mm[Hg]',
          },
        ]);
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

      const withDefaults = applyDefaultValuesToResource(resource, schema, { debug: true });

      expect(withDefaults).toEqual({
        resourceType: 'Patient',
        identifier: [],
        name: [],
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

        const modifiedSlice = { ...slice, min: 1, max: 1 };

        const visitor = new DefaultValueVisitor([], slicedElement.path, 'element');
        const crawler = new SchemaCrawler(schema, visitor);
        crawler.crawlSlice(slicedElement, key, modifiedSlice, slicing);
        const result = visitor.getDefaultValue();
        expect(result).toEqual([
          {
            url: raceExtensionUrl,
          },
        ]);
      });
    });
  });
});
