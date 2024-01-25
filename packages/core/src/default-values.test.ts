import { USCoreStructureDefinitionList } from '@medplum/mock';
import { loadDataType, tryGetProfile } from './typeschema/types';
import { isPopulated } from './utils';
import { Patient, StructureDefinition } from '@medplum/fhirtypes';
import { applyDefaultValues } from './default-values';

// const medplum = new MockClient();

describe('applyDefaultValues', () => {
  describe('US Core Patient', () => {
    const patientProfileUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
    const profileUrls = [
      patientProfileUrl,
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
    ];

    beforeAll(() => {
      const sds = profileUrls
        .map((profileUrl) => {
          return USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl);
        })
        .filter((sd): sd is StructureDefinition => isPopulated(sd));

      expect(sds.length).toEqual(5);

      for (const sd of sds) {
        loadDataType(sd, sd?.url);
      }
    });

    test('new Patient', async () => {
      const resource: Patient = { resourceType: 'Patient' };
      const patientSchema = tryGetProfile(patientProfileUrl);
      if (!isPopulated(patientSchema)) {
        fail('Expected patient profile schema to be loaded');
      }

      applyDefaultValues(resource, patientSchema, { debug: true });
    });

    test.only('contrived', async () => {
      const resource: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  system: 'urn:oid:2.16.840.1.113883.6.238',
                  code: '2106-3',
                  display: 'White',
                },
              },
              {
                url: 'detailed',
                valueCoding: {
                  system: 'urn:oid:2.16.840.1.113883.6.238',
                  code: '1010-8',
                  display: 'Apache',
                },
              },
              {
                url: 'text',
                valueString: 'Mixed',
              },
            ],
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
          },
          {
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  system: 'urn:oid:2.16.840.1.113883.6.238',
                  code: '2186-5',
                  display: 'Not Hispanic or Latino',
                },
              },
              {
                url: 'detailed',
                valueCoding: {
                  system: 'urn:oid:2.16.840.1.113883.6.238',
                  code: '2140-2',
                  display: 'Castillian',
                },
              },
              {
                url: 'text',
                valueString: 'Not hispanic',
              },
            ],
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
          },
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
            valueCode: 'F',
          },
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
            valueCodeableConcept: {
              coding: [
                {
                  system: 'urn:oid:2.16.840.1.113762.1.4.1021.32',
                  code: 'M',
                  display: 'Male',
                },
              ],
            },
          },
        ],
      };
      const patientSchema = tryGetProfile(patientProfileUrl);
      if (!isPopulated(patientSchema)) {
        fail('Expected patient profile schema to be loaded');
      }

      applyDefaultValues(resource, patientSchema, { debug: true });
    });
  });
});
