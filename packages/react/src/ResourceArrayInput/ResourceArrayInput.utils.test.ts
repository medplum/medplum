import { HTTP_HL7_ORG, InternalTypeSchema, isProfileLoaded, loadDataType, tryGetProfile } from '@medplum/core';
import { assignValuesIntoSlices, prepareSlices } from './ResourceArrayInput.utils';
import { MockClient, USCoreStructureDefinitionList } from '@medplum/mock';
import { StructureDefinition } from '@medplum/fhirtypes';
import { buildElementsContext } from '../ElementsInput/ElementsInput.utils';

const medplum = new MockClient();

describe('assignValuesIntoSlices', () => {
  describe('US Core Patient', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const profilesToLoad = [
      profileUrl,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
    ];
    const patientSD = USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl) as StructureDefinition;
    let patientSchema: InternalTypeSchema;

    beforeAll(() => {
      expect(patientSD).toBeDefined();
      for (const url of profilesToLoad) {
        const sd = USCoreStructureDefinitionList.find((sd) => sd.url === url);
        if (!sd) {
          fail(`could not find structure definition for ${url}`);
        }
        loadDataType(sd, sd.url);
      }
      expect(isProfileLoaded(profileUrl)).toBe(true);
      patientSchema = tryGetProfile(profileUrl) as InternalTypeSchema;
      expect(patientSchema).toBeDefined();
    });

    test('Patient.extension (race, ethnicity, birthsex, genderIdentity)', async () => {
      const patient = {
        id: 'homer-simpson',
        extension: [
          {
            extension: [
              {
                url: 'text',
                valueString: 'Some text',
              },
            ],
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
          },
          {
            extension: [
              {
                url: 'text',
                valueString: 'Some text',
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
                  system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
                  code: 'ASKU',
                  display: 'asked but unknown',
                },
              ],
              text: 'asked but unknown',
            },
          },
        ],
      };

      const property = patientSchema.elements['extension'];

      const elementsContext = buildElementsContext({
        parentContext: undefined,
        elements: patientSchema.elements,
        parentPath: 'Patient',
        parentType: 'Patient',
        profileUrl,
      });

      const slices = await prepareSlices({
        medplum,
        property,
      });

      expect(slices.length).toBe(4);
      const slicedValues = assignValuesIntoSlices(
        patient.extension,
        slices,
        property.slicing,
        elementsContext.profileUrl
      );
      expect(slicedValues.map((sliceValues) => sliceValues.length)).toEqual([1, 1, 1, 1, 0]);
    });
  });

  describe('US Core Blood Pressure', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-blood-pressure`;
    const bpSD = USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl) as StructureDefinition;
    let bpSchema: InternalTypeSchema;

    beforeAll(() => {
      expect(bpSD).toBeDefined();
      loadDataType(bpSD, bpSD.url);
      expect(isProfileLoaded(profileUrl)).toBe(true);
      bpSchema = tryGetProfile(profileUrl) as InternalTypeSchema;
      expect(bpSchema).toBeDefined();
    });

    test('Observation.category (VSCat)', async () => {
      const resource = {
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
              },
            ],
          },
        ],
      };

      const property = bpSchema.elements['category'];

      const elementsContext = buildElementsContext({
        parentContext: undefined,
        elements: bpSchema.elements,
        parentPath: 'Observation',
        parentType: 'Observation',
        profileUrl,
      });

      const slices = await prepareSlices({
        medplum,
        property,
      });

      expect(slices.length).toBe(1);
      const slicedValues = assignValuesIntoSlices(
        resource.category,
        slices,
        property.slicing,
        elementsContext.profileUrl
      );
      expect(slicedValues.map((sliceValues) => sliceValues.length)).toEqual([1, 0]);
    });

    test('Observation.component (systolic and diastolic)', async () => {
      const resource = {
        component: [
          {
            code: {
              coding: [
                {
                  system: 'http://loinc.org',
                  code: '8480-6',
                },
              ],
              text: 'Systolic blood pressure',
            },
            valueQuantity: {
              value: 109,
              unit: 'mmHg',
              system: 'http://unitsofmeasure.org',
              code: 'mm[Hg]',
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
              text: 'Diastolic blood pressure',
            },
            valueQuantity: {
              value: 49,
              unit: 'mmHg',
              system: 'http://unitsofmeasure.org',
              code: 'mm[Hg]',
            },
          },
        ],
      };

      const property = bpSchema.elements['component'];

      const elementsContext = buildElementsContext({
        parentContext: undefined,
        elements: bpSchema.elements,
        parentPath: 'Observation',
        parentType: 'Observation',
        profileUrl,
      });

      const slices = await prepareSlices({
        medplum,
        property,
      });
      const slicedValues = assignValuesIntoSlices(
        resource.component,
        slices,
        property.slicing,
        elementsContext.profileUrl
      );

      expect(slices.length).toBe(2);
      expect(slicedValues.map((sliceValues) => sliceValues.length)).toEqual([1, 1, 0]);
    });
  });

  // test('extensions', () => {});
});

// const values = [
//   {
//     extension: [
//       {
//         url: 'ombCategory',
//         valueCoding: {
//           system: 'urn:oid:2.16.840.1.113883.6.238',
//           code: '1002-5',
//           display: 'American Indian or Alaska Native',
//         },
//       },
//       {
//         url: 'detailed',
//         valueCoding: {
//           system: 'urn:oid:2.16.840.1.113883.6.238',
//           code: '1586-7',
//           display: 'Shoshone',
//         },
//       },
//       {
//         url: 'text',
//         valueString: 'Mixed',
//       },
//     ],
//     url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
//   },
//   {
//     extension: [
//       {
//         url: 'ombCategory',
//         valueCoding: {
//           system: 'urn:oid:2.16.840.1.113883.6.238',
//           code: '2135-2',
//           display: 'Hispanic or Latino',
//         },
//       },
//       {
//         url: 'detailed',
//         valueCoding: {
//           system: 'urn:oid:2.16.840.1.113883.6.238',
//           code: '2184-0',
//           display: 'Dominican',
//         },
//       },
//       {
//         url: 'text',
//         valueString: 'Hispanic or Latino',
//       },
//     ],
//     url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
//   },
//   {
//     url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
//     valueCode: 'F',
//   },
//   {
//     url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
//     valueCodeableConcept: {
//       coding: [
//         {
//           system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
//           code: 'ASKU',
//           display: 'asked but unknown',
//         },
//       ],
//       text: 'asked but unknown',
//     },
//   },
// ];
