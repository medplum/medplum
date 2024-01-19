import {
  HTTP_HL7_ORG,
  InternalTypeSchema,
  SliceDefinition,
  isPopulated,
  isProfileLoaded,
  loadDataType,
  parseStructureDefinition,
  tryGetProfile,
} from '@medplum/core';
import { StructureDefinition } from '@medplum/fhirtypes';
import { MockClient, USCoreStructureDefinitionList } from '@medplum/mock';
import { ElementsContextType, buildElementsContext } from './ElementsInput.utils';
import { prepareSlices } from '../ResourceArrayInput/ResourceArrayInput.utils';

const medplum = new MockClient();

describe('buildElementsContext', () => {
  test('deeply nested schema', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-medicationrequest`;
    const sd = USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl);
    if (!isPopulated(sd)) {
      fail(`Expected structure definition for ${profileUrl} to be found`);
    }

    const schema = parseStructureDefinition(sd);

    if (!isPopulated(schema.type)) {
      fail('Expected StructureDefinition to have a type');
    }

    const context = buildElementsContext({
      elements: schema.elements,
      parentPath: 'MedicationRequest',
      parentContext: undefined,
      parentType: schema.type,
      profileUrl,
    });

    expect(context.profileUrl).toEqual(sd.url);
    expect(context.getModifiedNestedElement('MedicationRequest.dosageInstruction.method')).toBeDefined();
  });
});

describe('modify default values', () => {
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
    let schema: InternalTypeSchema;

    function buildPatientContext(): ElementsContextType {
      return buildElementsContext({
        parentContext: undefined,
        elements: schema.elements,
        parentPath: 'Patient',
        parentType: 'Patient',
        profileUrl,
      });
    }

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
      schema = tryGetProfile(profileUrl) as InternalTypeSchema;
      expect(schema).toBeDefined();
    });

    test('Patient.extension slices (race, ethnicity, birthsex, genderIdentity)', async () => {
      const patientContext = buildPatientContext();

      const property = schema.elements.extension;

      const slices = await prepareSlices({ medplum, property });
      expect(slices.length).toEqual(4);
      const sliceInfo: [string, any][] = [
        ['race', { url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race' }],
        ['ethnicity', { url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity' }],
        ['birthsex', { url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex' }],
        ['genderIdentity', { url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity' }],
      ];

      for (const [name, expected] of sliceInfo) {
        const slice = slices.find((s) => s.name === name);
        if (!isPopulated(slice)) {
          fail(`Expected to find ${name} slice`);
        }
        // console.log(JSON.stringify(slice, undefined, 2));
        if (!isPopulated(slice.type)) {
          fail(`Expected slice to have at least one type`);
        }
        const sliceType = slice.type[0].code;
        expect(sliceType).toEqual('Extension');

        const sliceContext = buildElementsContext({
          parentContext: patientContext,
          elements: slice.typeSchema?.elements ?? slice.elements,
          parentPath: 'Patient.extension',
          parentType: sliceType,
        });
        const output = sliceContext.modifyDefaultValue({});
        expect(output).toEqual(expected);
      }
    });
  });

  describe('US Core Blood Pressure', () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-blood-pressure`;
    const bpSD = USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl) as StructureDefinition;
    let schema: InternalTypeSchema;

    beforeAll(() => {
      expect(bpSD).toBeDefined();
      loadDataType(bpSD, bpSD.url);
      expect(isProfileLoaded(profileUrl)).toBe(true);
      schema = tryGetProfile(profileUrl) as InternalTypeSchema;
      expect(schema).toBeDefined();
    });

    function buildObservationContext(): ElementsContextType {
      return buildElementsContext({
        parentContext: undefined,
        elements: schema.elements,
        parentPath: 'Observation',
        parentType: 'Observation',
        profileUrl,
      });
    }

    test('Minimal input', () => {
      const resource = {
        resourceType: 'Observation',
      };
      const observationContext = buildObservationContext();

      const output = observationContext.modifyDefaultValue(resource);
      const expectedOutput = {
        resourceType: 'Observation',
        code: { coding: [{ system: 'http://loinc.org', code: '85354-9' }] },
      };
      expect(output).toEqual(expectedOutput);
    });

    test('Observation.category slice', () => {
      const observationContext = buildObservationContext();
      const slicing = schema.elements.category.slicing;
      if (!isPopulated(slicing?.slices)) {
        fail('Expected slices to be defined');
      }
      expect(slicing.slices.length).toEqual(1);
      const slice = slicing.slices[0] as SliceDefinition;
      if (!isPopulated(slice.type)) {
        fail(`Expected slice.type to have at least one entry`);
      }
      const sliceType = slice.type[0].code;

      const categoryContext = buildElementsContext({
        parentContext: observationContext,
        elements: slice.elements,
        parentPath: 'Observation.category',
        parentType: sliceType,
      });

      const expectedCategoryOutput = {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }],
      };
      const categoryOutput = categoryContext.modifyDefaultValue({});
      expect(categoryOutput).toEqual(expectedCategoryOutput);
    });

    test('Observation.component slices', () => {
      const observationContext = buildObservationContext();

      const slicing = schema.elements.component.slicing;
      if (!isPopulated(slicing?.slices)) {
        fail('Expected slices to be defined');
      }
      expect(slicing.slices.length).toEqual(2);

      const systolicSlice = slicing.slices.find((s) => s.name === 'systolic');
      const diastolicSlice = slicing.slices.find((s) => s.name === 'diastolic');
      if (!isPopulated(systolicSlice) || !isPopulated(diastolicSlice)) {
        fail('Expected to find systolic and diastolic slices');
      }

      if (!isPopulated(systolicSlice.type) || !isPopulated(diastolicSlice.type)) {
        fail(`Expected slices to have at least one type`);
      }

      const sliceType = systolicSlice.type[0].code;
      expect(sliceType).toEqual('ObservationComponent');
      expect(diastolicSlice.type[0].code).toEqual(sliceType);

      const [systolicContext, diastolicContext] = [systolicSlice, diastolicSlice].map((slice) =>
        buildElementsContext({
          parentContext: observationContext,
          elements: slice.elements,
          parentPath: 'Observation.component',
          parentType: sliceType,
        })
      );

      const systolicExpected = {
        code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
        valueQuantity: { system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      };
      const systolicOutput = systolicContext.modifyDefaultValue({});
      expect(systolicOutput).toEqual(systolicExpected);

      const diastolicExpected = {
        code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
        valueQuantity: { system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      };
      const diastolicOutput = diastolicContext.modifyDefaultValue({});
      expect(diastolicOutput).toEqual(diastolicExpected);
    });
  });
});
