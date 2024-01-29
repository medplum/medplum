import { USCoreStructureDefinitionList } from '@medplum/mock';
import { InternalTypeSchema, getProfile, loadDataType } from './typeschema/types';
import { isPopulated } from './utils';
import { Observation, Patient, StructureDefinition } from '@medplum/fhirtypes';
import { applyDefaultValues } from './default-values';
import { HTTP_HL7_ORG } from './constants';
import USOccipitalFrontal from './__test__/StructureDefinition-head-occipital-frontal-circumference-percentile.json';

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

      const withDefaults = applyDefaultValues(resource, schema, { debug: true });

      expect(withDefaults).toEqual({
        resourceType: 'Observation',
        category: [
          {
            __w: 'onEnterSlice[VSCat] min > 0',
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
        subject: {},
      });
    });
  });

  describe('US Blood Pressure', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-blood-pressure`;
    const profileUrls = [profileUrl];

    let schema: InternalTypeSchema;

    beforeAll(() => {
      const sds = profileUrls
        .map((profileUrl) => {
          return USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl);
        })
        .filter((sd): sd is StructureDefinition => isPopulated(sd));

      expect(sds.length).toEqual(profileUrls.length);

      for (const sd of sds) {
        loadDataType(sd, sd?.url);
      }

      schema = getProfile(profileUrl);
    });

    test('new Blood Pressure observation', async () => {
      // casting since purposefully don't want to specify any values
      const resource = { resourceType: 'Observation' } as Observation;

      const withDefaults = applyDefaultValues(resource, schema, { debug: true });

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
  });

  describe('US Core Patient', () => {
    const profileUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
    const profileUrls = [
      profileUrl,
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
    ];

    let schema: InternalTypeSchema;

    beforeAll(() => {
      const sds = profileUrls
        .map((profileUrl) => {
          return USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl);
        })
        .filter((sd): sd is StructureDefinition => isPopulated(sd));

      expect(sds.length).toEqual(profileUrls.length);

      for (const sd of sds) {
        loadDataType(sd, sd?.url);
      }

      schema = getProfile(profileUrl);
    });

    test('new Patient', async () => {
      const resource: Patient = { resourceType: 'Patient' };

      const withDefaults = applyDefaultValues(resource, schema, { debug: true });

      expect(withDefaults).toEqual({
        resourceType: 'Patient',
        identifier: [],
        name: [],
      });
    });
  });
});
