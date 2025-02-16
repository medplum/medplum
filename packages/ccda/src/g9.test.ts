import { createReference, generateId } from '@medplum/core';
import {
  AllergyIntolerance,
  Bundle,
  Composition,
  CompositionSection,
  MedicationRequest,
  Patient,
  Resource,
} from '@medplum/fhirtypes';
import { convertFhirToCcda } from './fhir-to-ccda';
import { CcdaCode, CcdaQuantity } from './types';

describe('170.315(g)(9)', () => {
  describe('Patient Demographics', () => {
    it('should export first name', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', name: [{ given: ['John'] }] });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.given?.[0]).toEqual('John');
    });

    // Last Name
    it('should export last name', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', name: [{ family: 'Doe' }] });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.family).toEqual('Doe');
    });

    // Previous Name (if applicable)
    it('should export previous name', () => {
      const input = createCompositionBundle({
        resourceType: 'Patient',
        name: [
          { use: 'official', family: 'Johnson', given: ['Sarah'] },
          { use: 'maiden', family: 'Smith', given: ['Sarah'], period: { end: '2018-06-15' } },
        ],
      });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.['@_use']).toEqual('L');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.given?.[0]).toEqual('Sarah');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.family).toEqual('Johnson');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[1]?.['@_use']).toEqual('M');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[1]?.given?.[0]).toEqual('Sarah');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[1]?.family).toEqual('Smith');
    });

    // Middle Name
    it('should export middle name', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', name: [{ given: ['John', 'Doe'] }] });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.given?.[1]).toEqual('Doe');
    });

    // Suffix
    it('should export suffix', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', name: [{ given: ['John'], suffix: ['Jr.'] }] });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.suffix?.[0]).toEqual('Jr.');
    });

    // Birth Sex
    it('should export birth sex', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', gender: 'male' });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.administrativeGenderCode?.['@_code']).toEqual('M');
    });

    // Date of Birth
    it('should export date of birth', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', birthDate: '1990-01-01' });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.birthTime?.['@_value']).toEqual('19900101');
    });

    // Race and Ethnicity
    it('should export race and ethnicity', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-Race',
                  code: '2106-3',
                  display: 'White',
                },
              },
            ],
          },
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-Race',
                  code: '2186-5',
                  display: 'Not Hispanic or Latino',
                },
              },
            ],
          },
        ],
      };

      const input = createCompositionBundle(patient);
      const output = convertFhirToCcda(input);

      // Test race code
      expect(output.recordTarget?.[0]?.patientRole?.patient?.raceCode?.[0]?.['@_code']).toEqual('2106-3');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.raceCode?.[0]?.['@_displayName']).toEqual('White');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.raceCode?.[0]?.['@_codeSystem']).toEqual(
        '2.16.840.1.113883.6.238'
      );
      expect(output.recordTarget?.[0]?.patientRole?.patient?.raceCode?.[0]?.['@_codeSystemName']).toEqual(
        'CDC Race and Ethnicity'
      );

      // Test ethnicity code
      expect(output.recordTarget?.[0]?.patientRole?.patient?.ethnicGroupCode?.[0]?.['@_code']).toEqual('2186-5');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.ethnicGroupCode?.[0]?.['@_displayName']).toEqual(
        'Not Hispanic or Latino'
      );
      expect(output.recordTarget?.[0]?.patientRole?.patient?.ethnicGroupCode?.[0]?.['@_codeSystem']).toEqual(
        '2.16.840.1.113883.6.238'
      );
      expect(output.recordTarget?.[0]?.patientRole?.patient?.ethnicGroupCode?.[0]?.['@_codeSystemName']).toEqual(
        'CDC Race and Ethnicity'
      );
    });

    // Preferred Language
    it('should export preferred language', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        communication: [
          {
            language: {
              coding: [
                {
                  system: 'urn:ietf:bcp:47',
                  code: 'en-US',
                },
              ],
            },
            preferred: true,
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/language-mode',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/v3-LanguageAbilityMode',
                      code: 'ESP',
                      display: 'Expressed spoken',
                    },
                  ],
                },
              },
              {
                url: 'http://hl7.org/fhir/StructureDefinition/language-proficiency',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/v3-LanguageAbilityProficiency',
                      code: 'E',
                      display: 'Excellent',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const input = createCompositionBundle(patient);
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.languageCommunication?.[0]?.['@_languageCode']).toEqual(
        'en-US'
      );
    });

    // Current Address
    it('should export current address', () => {
      const input = createCompositionBundle({
        resourceType: 'Patient',
        address: [{ use: 'home', line: ['123 Main St'], city: 'Anytown', state: 'CA', postalCode: '12345' }],
      });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.addr?.[0]?.['@_use']).toEqual('HP');
      expect(output.recordTarget?.[0]?.patientRole?.addr?.[0]?.streetAddressLine?.[0]).toEqual('123 Main St');
      expect(output.recordTarget?.[0]?.patientRole?.addr?.[0]?.city).toEqual('Anytown');
      expect(output.recordTarget?.[0]?.patientRole?.addr?.[0]?.state).toEqual('CA');
      expect(output.recordTarget?.[0]?.patientRole?.addr?.[0]?.postalCode).toEqual('12345');
    });

    // Phone Number
    it('should export phone number', () => {
      const input = createCompositionBundle({
        resourceType: 'Patient',
        telecom: [{ system: 'phone', value: '123-456-7890' }],
      });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.telecom?.[0]?.['@_value']).toEqual('tel:123-456-7890');
    });
  });

  describe('Allergies', () => {
    // Must include reactions and severity
    it('should export reactions and severity', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        { resourceType: 'AllergyIntolerance', reaction: [{ manifestation: [{ coding: [{ code: '123' }] }] }] }
      );

      const output = convertFhirToCcda(input);
      const observation =
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.entryRelationship?.[0]
          ?.observation?.[0]?.entryRelationship?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      expect((observation?.value as CcdaCode)?.['@_code']).toEqual('123');
    });

    // Include timing information and concern status Reference: Section III.A in test data samples [2]
    it('should export timing information and concern status', () => {
      const allergy: Partial<AllergyIntolerance> = {
        resourceType: 'AllergyIntolerance',
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
              code: 'active',
            },
          ],
        },
        recordedDate: '2024-01-01',
        onsetDateTime: '2023-12-25',
        reaction: [
          {
            manifestation: [
              {
                coding: [{ code: '123' }],
              },
            ],
          },
        ],
      };

      const input = createCompositionBundle({ resourceType: 'Patient' }, allergy);

      const output = convertFhirToCcda(input);

      // Check act timing (when recorded)
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.effectiveTime?.[0]?.[
          '@_value'
        ]
      ).toEqual('20240101');

      // Check observation timing (when started)
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.entryRelationship?.[0]
          ?.observation?.[0]?.effectiveTime?.[0]?.['@_value']
      ).toEqual('20231225');

      // Check status
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.statusCode?.['@_code']
      ).toEqual('active');
    });
  });

  // Medications
  describe('Medications', () => {
    it('should export timing information and dosage', () => {
      const medication: Partial<MedicationRequest> = {
        resourceType: 'MedicationRequest',
        status: 'active',
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '1049221',
              display: 'Insulin Glargine 100 UNT/ML Injectable Solution',
            },
          ],
        },
        dispenseRequest: {
          validityPeriod: {
            start: '2024-01-01',
          },
        },
        dosageInstruction: [
          {
            timing: {
              repeat: {
                when: ['HS'], // At bedtime
              },
            },
            doseAndRate: [
              {
                doseQuantity: {
                  value: 40,
                  unit: '[IU]',
                  system: 'http://unitsofmeasure.org',
                  code: '[IU]',
                },
              },
            ],
            route: {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: '34206005',
                  display: 'Subcutaneous route',
                },
              ],
            },
          },
        ],
      };

      const input = createCompositionBundle({ resourceType: 'Patient' }, medication);

      const output = convertFhirToCcda(input);

      // Check timing
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration?.[0]
          ?.effectiveTime?.[0]?.low?.['@_value']
      ).toEqual('20240101');

      // Check dose quantity
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration?.[0]
          ?.doseQuantity?.['@_value']
      ).toEqual('40');
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration?.[0]
          ?.doseQuantity?.['@_unit']
      ).toEqual('[IU]');

      // Check route
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration?.[0]
          ?.routeCode?.['@_code']
      ).toEqual('34206005');
    });
  });

  describe('Problems', () => {
    it('should export problems', () => {
      // Include timing information
      // - Include concern status Reference: Section III.C in test data samples [2]
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        {
          resourceType: 'Condition',
          clinicalStatus: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                code: 'active',
              },
            ],
          },
          recordedDate: '2024-01-01',
          onsetDateTime: '2023-12-25',
          code: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '385093006',
                display: 'Community acquired pneumonia',
              },
            ],
          },
        }
      );
      const output = convertFhirToCcda(input);

      // Check act timing (when recorded)
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.effectiveTime?.[0]?.[
          '@_value'
        ]
      ).toEqual('20240101');

      // Check observation timing (when started)
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.entryRelationship?.[0]
          ?.observation?.[0]?.effectiveTime?.[0]?.low?.['@_value']
      ).toEqual('20231225');

      // Check status
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.statusCode?.['@_code']
      ).toEqual('active');
    });
  });

  describe('Immunizations', () => {
    it('should export immunizations', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, { resourceType: 'Immunization' });
      const output = convertFhirToCcda(input);
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration
      ).toBeDefined();
    });

    it('should include status and dates', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        { resourceType: 'Immunization', status: 'completed', occurrenceDateTime: '2010-08-15' }
      );
      const output = convertFhirToCcda(input);
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration?.[0]
          ?.statusCode?.['@_code']
      ).toEqual('completed');
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration?.[0]
          ?.effectiveTime?.[0]?.['@_value']
      ).toEqual('20100815');
    });

    it('should include lot number and manufacturer', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        { resourceType: 'Immunization', lotNumber: '1', manufacturer: { display: 'Manufacturer' } }
      );
      const output = convertFhirToCcda(input);
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration?.[0]
          ?.consumable?.manufacturedProduct?.[0]?.manufacturedMaterial?.[0]?.lotNumberText?.[0]
      ).toEqual('1');
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration?.[0]
          ?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization?.[0]?.name?.[0]
      ).toEqual('Manufacturer');
    });
  });

  describe('Vital Signs', () => {
    it('should export vital signs', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, { resourceType: 'Observation' });
      const output = convertFhirToCcda(input);
      expect(output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.observation).toBeDefined();
    });

    it('should include values and units', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        { resourceType: 'Observation', valueQuantity: { value: 100, unit: 'mg' } }
      );
      const output = convertFhirToCcda(input);
      const observation = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      const value = observation?.value as CcdaQuantity;
      expect(value?.['@_value']).toEqual('100');
      expect(value?.['@_unit']).toEqual('mg');
    });
  });
});

function createCompositionBundle(patient: Patient, ...resources: Partial<Resource>[]): Bundle {
  const resourceTypeToCode = {
    AllergyIntolerance: '48765-2',
    MedicationRequest: '10160-0',
    Condition: '11450-4',
    Immunization: '11369-6',
    Observation: '8716-3',
  };

  const sections: CompositionSection[] = [];

  for (const resource of resources) {
    resource.id = resource.id || generateId();
    sections.push({
      title: resource.resourceType,
      code: {
        coding: [
          {
            code: resourceTypeToCode[resource.resourceType as keyof typeof resourceTypeToCode],
            display: resource.resourceType,
          },
        ],
      },
      entry: [createReference(resource as Resource)],
    });
  }

  const composition: Composition = {
    resourceType: 'Composition',
    status: 'final',
    type: { text: 'test' },
    date: new Date().toISOString(),
    author: [{ display: 'test' }],
    title: 'test',
    subject: createReference(patient),
    section: sections,
  };

  return {
    resourceType: 'Bundle',
    type: 'document',
    entry: [{ resource: composition }, { resource: patient }, ...resources.map((r) => ({ resource: r as Resource }))],
  };
}
