// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, generateId, LOINC, RXNORM, SNOMED, UCUM, WithId } from '@medplum/core';
import { AllergyIntolerance, Bundle, Composition, MedicationRequest, Patient, Resource } from '@medplum/fhirtypes';
import { convertFhirToCcda } from './fhir-to-ccda/convert';
import {
  OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM,
  OID_BIRTH_SEX,
  OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
  OID_SEX_OBSERVATION,
  OID_SMOKING_STATUS_OBSERVATION,
  OID_TOBACCO_USE_OBSERVATION,
} from './oids';
import {
  ADMINISTRATIVE_GENDER_CODE_SYSTEM,
  ALLERGY_CLINICAL_CODE_SYSTEM,
  CLINICAL_CONDITION_CODE_SYSTEM,
  LANGUAGE_MODE_CODE_SYSTEM,
  LANGUAGE_MODE_URL,
  LANGUAGE_PROFICIENCY_CODE_SYSTEM,
  LANGUAGE_PROFICIENCY_URL,
  LOINC_ADMINISTRATIVE_SEX,
  LOINC_ALLERGIES_SECTION,
  LOINC_ASSESSMENTS_SECTION,
  LOINC_BIRTH_SEX,
  LOINC_DEVICES_SECTION,
  LOINC_ENCOUNTERS_SECTION,
  LOINC_GOALS_SECTION,
  LOINC_HEALTH_CONCERNS_SECTION,
  LOINC_HISTORY_OF_TOBACCO_USE,
  LOINC_IMMUNIZATIONS_SECTION,
  LOINC_MEDICATIONS_SECTION,
  LOINC_NOTES_SECTION,
  LOINC_PLAN_OF_TREATMENT_SECTION,
  LOINC_PROBLEMS_SECTION,
  LOINC_PROCEDURES_SECTION,
  LOINC_REASON_FOR_REFERRAL_SECTION,
  LOINC_REFERRAL_NOTE,
  LOINC_RESULTS_SECTION,
  LOINC_SOCIAL_HISTORY_SECTION,
  LOINC_TOBACCO_SMOKING_STATUS,
  LOINC_VITAL_SIGNS_SECTION,
  RACE_CODE_SYSTEM,
  US_CORE_ETHNICITY_URL,
  US_CORE_RACE_URL,
} from './systems';
import { CcdaCode, CcdaNarrative, CcdaQuantity, CcdaText } from './types';

describe('170.315(g)(9)', () => {
  describe('Patient Demographics', () => {
    test('should export first name', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', name: [{ given: ['John'] }] });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.given?.[0]).toEqual('John');
    });

    // Last Name
    test('should export last name', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', name: [{ family: 'Doe' }] });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.family).toEqual('Doe');
    });

    // Previous Name (if applicable)
    test('should export previous name', () => {
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
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[1]?.['@_use']).toEqual('L');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[1]?.given?.[0]).toEqual('Sarah');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[1]?.family).toEqual('Smith');
    });

    // Middle Name
    test('should export middle name', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', name: [{ given: ['John', 'Doe'] }] });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.given?.[1]).toEqual('Doe');
    });

    // Suffix
    test('should export suffix', () => {
      const input = createCompositionBundle({
        resourceType: 'Patient',
        name: [{ given: ['John'], suffix: ['Jr.'] }],
      });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.name?.[0]?.suffix?.[0]).toEqual('Jr.');
    });

    // Birth Sex
    test('should export birth sex', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', gender: 'male' });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.administrativeGenderCode?.['@_code']).toEqual('M');
    });

    // Date of Birth
    test('should export date of birth', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', birthDate: '1990-01-01' });
      const output = convertFhirToCcda(input);
      expect(output.recordTarget?.[0]?.patientRole?.patient?.birthTime?.['@_value']).toEqual('19900101');
    });

    // Race and Ethnicity
    test('should export race and ethnicity', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: US_CORE_RACE_URL,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  system: RACE_CODE_SYSTEM,
                  code: '2106-3',
                  display: 'White',
                },
              },
              {
                url: 'detailed',
                valueCoding: {
                  system: RACE_CODE_SYSTEM,
                  code: '2108-9',
                  display: 'White European',
                },
              },
            ],
          },
          {
            url: US_CORE_ETHNICITY_URL,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  system: RACE_CODE_SYSTEM,
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
        OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM
      );
      expect(output.recordTarget?.[0]?.patientRole?.patient?.raceCode?.[0]?.['@_codeSystemName']).toEqual(
        'CDC Race and Ethnicity'
      );

      // Test detailed race code
      const detailed = output.recordTarget?.[0]?.patientRole?.patient?.['sdtc:raceCode']?.[0];
      expect(detailed?.['@_code']).toEqual('2108-9');
      expect(detailed?.['@_displayName']).toEqual('White European');
      expect(detailed?.['@_codeSystem']).toEqual(OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM);
      expect(detailed?.['@_codeSystemName']).toEqual('CDC Race and Ethnicity');

      // Test ethnicity code
      expect(output.recordTarget?.[0]?.patientRole?.patient?.ethnicGroupCode?.[0]?.['@_code']).toEqual('2186-5');
      expect(output.recordTarget?.[0]?.patientRole?.patient?.ethnicGroupCode?.[0]?.['@_displayName']).toEqual(
        'Not Hispanic or Latino'
      );
      expect(output.recordTarget?.[0]?.patientRole?.patient?.ethnicGroupCode?.[0]?.['@_codeSystem']).toEqual(
        OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM
      );
      expect(output.recordTarget?.[0]?.patientRole?.patient?.ethnicGroupCode?.[0]?.['@_codeSystemName']).toEqual(
        'CDC Race and Ethnicity'
      );
    });

    // Preferred Language
    test('should export preferred language', () => {
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
                url: LANGUAGE_MODE_URL,
                valueCodeableConcept: {
                  coding: [
                    {
                      system: LANGUAGE_MODE_CODE_SYSTEM,
                      code: 'ESP',
                      display: 'Expressed spoken',
                    },
                  ],
                },
              },
              {
                url: LANGUAGE_PROFICIENCY_URL,
                valueCodeableConcept: {
                  coding: [
                    {
                      system: LANGUAGE_PROFICIENCY_CODE_SYSTEM,
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
      expect(
        output.recordTarget?.[0]?.patientRole?.patient?.languageCommunication?.[0]?.languageCode?.['@_code']
      ).toEqual('en-US');
    });

    // Current Address
    test('should export current address', () => {
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
    test('should export phone number', () => {
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
    test('should export reactions and severity', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_ALLERGIES_SECTION, {
        resourceType: 'AllergyIntolerance',
        reaction: [{ manifestation: [{ coding: [{ code: '123' }] }] }],
      });

      const output = convertFhirToCcda(input);
      const observation =
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.entryRelationship?.[0]
          ?.observation?.[0]?.entryRelationship?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      expect((observation?.value as CcdaCode)?.['@_code']).toEqual('123');
    });

    // Include timing information and concern status Reference: Section III.A in test data samples [2]
    test('should export timing information and concern status', () => {
      const allergy: Partial<AllergyIntolerance> = {
        resourceType: 'AllergyIntolerance',
        clinicalStatus: {
          coding: [
            {
              system: ALLERGY_CLINICAL_CODE_SYSTEM,
              code: 'active',
            },
          ],
        },
        category: ['medication'],
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

      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_ALLERGIES_SECTION, allergy);

      const output = convertFhirToCcda(input);

      // Check that category="medication" converts to the correct code
      expect(
        (
          output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.entryRelationship?.[0]
            ?.observation?.[0]?.value as CcdaCode
        )?.['@_code']
      ).toEqual('419511003');

      // Check act timing (when recorded)
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.effectiveTime?.[0]?.low?.[
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

    test('should handle no known allergies', () => {
      const allergy: Partial<AllergyIntolerance> = {
        resourceType: 'AllergyIntolerance',
        clinicalStatus: {
          coding: [
            {
              system: ALLERGY_CLINICAL_CODE_SYSTEM,
              code: 'active',
            },
          ],
        },
        code: {
          coding: [
            {
              system: SNOMED,
              code: '716186003',
              display: 'No Known Allergy (situation)',
            },
          ],
          text: 'NKA',
        },
        recordedDate: '2024-01-01',
        onsetDateTime: '2023-12-25',
      };

      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_ALLERGIES_SECTION, allergy);

      const output = convertFhirToCcda(input);

      // Check that empty category converts to the default code
      expect(
        (
          output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.entryRelationship?.[0]
            ?.observation?.[0]?.value as CcdaCode
        )?.['@_code']
      ).toEqual('419199007');

      // Look for the special NKA code
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.entryRelationship?.[0]
          ?.observation?.[0]?.participant?.[0]?.participantRole?.playingEntity?.code?.['@_nullFlavor']
      ).toEqual('NA');
    });
  });

  // Medications
  describe('Medications', () => {
    test('should export timing information and dosage', () => {
      const medication: Partial<MedicationRequest> = {
        resourceType: 'MedicationRequest',
        status: 'active',
        medicationCodeableConcept: {
          coding: [
            {
              system: RXNORM,
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
                  system: UCUM,
                  value: 40,
                  unit: '[IU]',
                  code: '[IU]',
                },
              },
            ],
            route: {
              coding: [
                {
                  system: SNOMED,
                  code: '34206005',
                  display: 'Subcutaneous route',
                },
              ],
            },
          },
        ],
      };

      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_MEDICATIONS_SECTION, medication);

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
    test('should export problems', () => {
      // Include timing information
      // - Include concern status Reference: Section III.C in test data samples [2]
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_PROBLEMS_SECTION, {
        resourceType: 'Condition',
        clinicalStatus: {
          coding: [
            {
              system: CLINICAL_CONDITION_CODE_SYSTEM,
              code: 'active',
            },
          ],
        },
        recordedDate: '2024-01-01',
        onsetDateTime: '2023-12-25',
        code: {
          coding: [
            {
              system: SNOMED,
              code: '385093006',
              display: 'Community acquired pneumonia',
            },
          ],
        },
      });
      const output = convertFhirToCcda(input);

      // Check act timing (when recorded)
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.act?.[0]?.effectiveTime?.[0]?.low?.[
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
    test('should export immunizations', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_IMMUNIZATIONS_SECTION, {
        resourceType: 'Immunization',
      });
      const output = convertFhirToCcda(input);
      expect(
        output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.substanceAdministration
      ).toBeDefined();
    });

    test('should include status and dates', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_IMMUNIZATIONS_SECTION, {
        resourceType: 'Immunization',
        status: 'completed',
        occurrenceDateTime: '2010-08-15',
      });
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

    test('should include lot number and manufacturer', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_IMMUNIZATIONS_SECTION, {
        resourceType: 'Immunization',
        lotNumber: '1',
        manufacturer: { display: 'Manufacturer' },
      });
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
    test('should export vital signs', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_VITAL_SIGNS_SECTION, {
        resourceType: 'Observation',
      });
      const output = convertFhirToCcda(input);
      expect(output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.observation).toBeDefined();
    });

    test('should include values and units', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_VITAL_SIGNS_SECTION, {
        resourceType: 'Observation',
        valueQuantity: { value: 100, unit: 'mg' },
      });
      const output = convertFhirToCcda(input);
      const observation = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      const value = observation?.value as CcdaQuantity;
      expect(value?.['@_value']).toEqual('100');
      expect(value?.['@_unit']).toEqual('mg');
    });

    test('should handle observation components', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        LOINC_VITAL_SIGNS_SECTION,
        {
          resourceType: 'Observation',
          id: '123',
          component: [
            { code: { coding: [{ code: 'a' }] }, valueQuantity: { value: 100, unit: 'mg' } },
            { code: { coding: [{ code: 'b' }] }, valueQuantity: { value: 200, unit: 'mg' } },
          ],
        },
        {
          resourceType: 'Observation',
          id: '456',
          hasMember: [{ reference: 'Observation/123' }],
        }
      );
      const output = convertFhirToCcda(input);
      const organizer = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[1]?.organizer?.[0];
      expect(organizer).toBeDefined();
      const components = organizer?.component;
      expect(components).toBeDefined();
      expect((components?.[0]?.observation?.[0]?.value as CcdaQuantity)['@_value']).toEqual('100');
      expect((components?.[1]?.observation?.[0]?.value as CcdaQuantity)['@_value']).toEqual('200');
    });
  });

  describe('Social History', () => {
    test('should handle tobacco smoking status', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_SOCIAL_HISTORY_SECTION, {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: LOINC_TOBACCO_SMOKING_STATUS }] },
        valueCodeableConcept: { coding: [{ system: SNOMED, code: '449868002' }] },
      });
      const output = convertFhirToCcda(input);
      const observation = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      expect(observation?.templateId?.[0]?.['@_root']).toEqual(OID_SMOKING_STATUS_OBSERVATION);
      expect((observation?.value as CcdaCode)?.['@_code']).toEqual('449868002');
    });

    test('should handle history of tobacco use', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_SOCIAL_HISTORY_SECTION, {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: LOINC_HISTORY_OF_TOBACCO_USE }] },
        valueCodeableConcept: { coding: [{ system: SNOMED, code: '449868002' }] },
      });
      const output = convertFhirToCcda(input);
      const observation = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      expect(observation?.templateId?.[0]?.['@_root']).toEqual(OID_TOBACCO_USE_OBSERVATION);
      expect((observation?.value as CcdaCode)?.['@_code']).toEqual('449868002');
    });

    test('should handle administrative gender', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_SOCIAL_HISTORY_SECTION, {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: LOINC_ADMINISTRATIVE_SEX }] },
        valueCodeableConcept: { coding: [{ system: SNOMED, code: '248152002' }] },
      });
      const output = convertFhirToCcda(input);
      const observation = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      expect(observation?.templateId?.[0]?.['@_root']).toEqual(OID_SEX_OBSERVATION);
      expect((observation?.value as CcdaCode)?.['@_code']).toEqual('248152002');
    });

    test('should handle birth sex', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_SOCIAL_HISTORY_SECTION, {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: LOINC_BIRTH_SEX }] },
        valueCodeableConcept: { coding: [{ system: ADMINISTRATIVE_GENDER_CODE_SYSTEM, code: 'F' }] },
      });
      const output = convertFhirToCcda(input);
      const observation = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      expect(observation?.templateId?.[0]?.['@_root']).toEqual(OID_BIRTH_SEX);
      expect((observation?.value as CcdaCode)?.['@_code']).toEqual('F');
      expect((observation?.value as CcdaCode)?.['@_codeSystem']).toEqual(OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM);
    });
  });

  describe('Procedures', () => {
    test('should handle missing location', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_PROCEDURES_SECTION, {
        resourceType: 'Procedure',
        id: '456',
        location: { reference: 'Location/123' },
      });
      const output = convertFhirToCcda(input);
      const procedure = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.procedure?.[0];
      expect(procedure).toBeDefined();
    });

    test('should handle empty location', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        LOINC_PROCEDURES_SECTION,
        {
          resourceType: 'Location',
          id: '123',
        },
        {
          resourceType: 'Procedure',
          id: '456',
          location: { reference: 'Location/123' },
        }
      );
      const output = convertFhirToCcda(input);
      const procedure = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.procedure?.[0];
      expect(procedure).toBeDefined();
      const participant = procedure?.participant?.[0];
      expect(participant).toBeDefined();
    });

    test('should create location participant', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        LOINC_PROCEDURES_SECTION,
        {
          resourceType: 'Location',
          id: '123',
          name: 'Test Location',
          address: { line: ['123 Main St'], city: 'Anytown', state: 'CA', postalCode: '12345' },
          telecom: [{ system: 'phone', value: '123-456-7890' }],
        },
        {
          resourceType: 'Procedure',
          id: '456',
          location: { reference: 'Location/123' },
        }
      );
      const output = convertFhirToCcda(input);
      const procedure = output.component?.structuredBody?.component?.[0]?.section?.[0]?.entry?.[0]?.procedure?.[0];
      expect(procedure).toBeDefined();
      const participant = procedure?.participant?.[0];
      expect(participant).toBeDefined();
      expect(participant?.participantRole?.addr?.[0]?.streetAddressLine?.[0]).toEqual('123 Main St');
      expect(participant?.participantRole?.addr?.[0]?.city).toEqual('Anytown');
      expect(participant?.participantRole?.addr?.[0]?.state).toEqual('CA');
      expect(participant?.participantRole?.addr?.[0]?.postalCode).toEqual('12345');
      expect(participant?.participantRole?.telecom?.[0]?.['@_value']).toEqual('tel:123-456-7890');
      expect(participant?.participantRole?.playingEntity?.name?.[0]).toEqual('Test Location');
    });
  });

  describe('Labs', () => {
    test('should handle orders', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_PLAN_OF_TREATMENT_SECTION, {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '24357-6',
              display: 'Urinanalysis macro (dipstick) panel',
            },
          ],
        },
        occurrenceDateTime: '2015-06-29T07:00:00.000Z',
        authoredOn: '2025-02-27T01:32:00.000Z',
      });
      const output = convertFhirToCcda(input);
      const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
      expect(section).toBeDefined();
      expect(section?.code?.['@_code']).toEqual(LOINC_PLAN_OF_TREATMENT_SECTION);
      const observation = section?.entry?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      expect(observation?.code?.['@_code']).toEqual('24357-6');
      expect(observation?.effectiveTime?.[0]?.['@_value']).toMatch('20150629');
    });

    test('should handle reports', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        LOINC_RESULTS_SECTION,
        {
          resourceType: 'Observation',
          id: '123',
          status: 'final',
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: '5778-6',
                display: 'Color of Urine',
              },
            ],
          },
          effectiveDateTime: '2015-06-22T07:00:00.000Z',
          valueString: 'YELLOW',
        },
        {
          resourceType: 'DiagnosticReport',
          status: 'final',
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: '24357-6',
                display: 'Urinanalysis macro (dipstick) panel',
              },
            ],
          },
          effectiveDateTime: '2015-06-22T07:00:00.000Z',
          issued: '2015-06-22T07:00:00.000Z',
          result: [{ reference: 'Observation/123' }],
        }
      );
      const output = convertFhirToCcda(input);
      const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
      expect(section).toBeDefined();
      expect(section?.code?.['@_code']).toEqual(LOINC_RESULTS_SECTION);
      const organizer = section?.entry?.[1]?.organizer?.[0];
      expect(organizer).toBeDefined();
      const components = organizer?.component;
      expect(components).toBeDefined();
      expect((components?.[0]?.observation?.[0]?.value as CcdaText)['#text']).toEqual('YELLOW');
    });
  });

  describe('Devices', () => {
    test('should handle device not found', () => {
      const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_DEVICES_SECTION, {
        resourceType: 'DeviceUseStatement',
        status: 'active',
        device: { reference: 'Device/123' },
      });
      const output = convertFhirToCcda(input);
      const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
      expect(section).toBeDefined();
      expect(section?.code?.['@_code']).toEqual(LOINC_DEVICES_SECTION);
      expect(section?.entry).toHaveLength(0);
    });

    test('should handle device use statements', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        LOINC_DEVICES_SECTION,
        {
          resourceType: 'Device',
          id: '123',
          udiCarrier: [
            {
              deviceIdentifier: '00643169007222',
              issuer: 'FDA',
              carrierHRF: '(01)00643169007222(17)160128(21)BLC200461H',
            },
          ],
          status: 'active',
          type: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '704708004',
                display: 'Cardiac resynchronization therapy implantable pacemaker',
              },
            ],
          },
        },
        {
          resourceType: 'DeviceUseStatement',
          status: 'active',
          device: { reference: 'Device/123' },
        }
      );
      const output = convertFhirToCcda(input);
      const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
      expect(section).toBeDefined();
      expect(section?.code?.['@_code']).toEqual(LOINC_DEVICES_SECTION);
      const procedure = section?.entry?.[0]?.procedure?.[0];
      expect(procedure).toBeDefined();
      expect(procedure?.code?.['@_code']).toEqual('360030002');
      expect(procedure?.participant?.length).toEqual(1);
      expect(procedure?.participant?.[0]?.['@_typeCode']).toEqual('DEV');
      const device = procedure?.participant?.[0]?.participantRole;
      expect(device).toBeDefined();
      expect(device?.playingDevice?.code?.['@_code']).toEqual('704708004');
    });
  });

  describe('Assessments', () => {
    test('should handle clinical impression', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        LOINC_ASSESSMENTS_SECTION,
        {
          resourceType: 'Practitioner',
          id: 'davis',
          name: [{ family: 'Davis', given: ['Albert'] }],
        },
        {
          resourceType: 'ClinicalImpression',
          status: 'completed',
          subject: {
            reference: 'Patient/01953565-5b00-72a8-ac87-3c4b3de1ba88',
            display: 'Alice Jones Newman',
          },
          date: '2015-06-22T07:00:00.000Z',
          assessor: {
            reference: 'Practitioner/davis',
            display: 'Dr Albert Davis',
          },
          summary: 'Lorem ipsum',
        }
      );
      const output = convertFhirToCcda(input);
      const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
      expect(section).toBeDefined();
      expect(section?.code?.['@_code']).toEqual(LOINC_ASSESSMENTS_SECTION);
      expect(section?.text).toEqual('Lorem ipsum');
    });
  });

  describe('Goals', () => {
    test('should handle goal', () => {
      const input = createCompositionBundle({ resourceType: 'Patient', id: '123' }, LOINC_GOALS_SECTION, {
        resourceType: 'Goal',
        lifecycleStatus: 'active',
        startDate: '2015-06-23',
        description: {
          text: 'Lorem ipsum',
        },
        subject: {
          reference: 'Patient/123',
          display: 'Alice Jones Newman',
        },
      });
      const output = convertFhirToCcda(input);
      const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
      expect(section).toBeDefined();
      expect(section?.code?.['@_code']).toEqual(LOINC_GOALS_SECTION);

      const observation = section?.entry?.[0]?.observation?.[0];
      expect(observation).toBeDefined();
      expect((observation?.value as CcdaNarrative)['#text']).toEqual('Lorem ipsum');
    });
  });

  describe('Health Concerns', () => {
    test('should handle clinical impression', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        LOINC_HEALTH_CONCERNS_SECTION,
        {
          resourceType: 'Practitioner',
          id: 'davis',
          name: [{ family: 'Davis', given: ['Albert'] }],
        },
        {
          resourceType: 'ClinicalImpression',
          status: 'completed',
          subject: {
            reference: 'Patient/01953565-5b00-72a8-ac87-3c4b3de1ba88',
            display: 'Alice Jones Newman',
          },
          date: '2015-06-22T07:00:00.000Z',
          assessor: {
            reference: 'Practitioner/davis',
            display: 'Dr Albert Davis',
          },
          summary: 'Lorem ipsum',
        }
      );
      const output = convertFhirToCcda(input);
      const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
      expect(section).toBeDefined();
      expect(section?.code?.['@_code']).toEqual(LOINC_HEALTH_CONCERNS_SECTION);
      const act = section?.entry?.[0]?.act?.[0];
      expect((act?.text as CcdaNarrative)['#text']).toEqual('Lorem ipsum');
    });
  });

  describe('Notes', () => {
    test('should handle clinical impression', () => {
      const input = createCompositionBundle(
        { resourceType: 'Patient' },
        LOINC_NOTES_SECTION,
        {
          resourceType: 'Practitioner',
          id: 'davis',
          name: [{ family: 'Davis', given: ['Albert'] }],
        },
        {
          resourceType: 'ClinicalImpression',
          status: 'completed',
          subject: {
            reference: 'Patient/01953565-5b00-72a8-ac87-3c4b3de1ba88',
            display: 'Alice Jones Newman',
          },
          date: '2015-06-22T07:00:00.000Z',
          assessor: {
            reference: 'Practitioner/davis',
            display: 'Dr Albert Davis',
          },
          summary: 'Lorem ipsum',
        }
      );
      const output = convertFhirToCcda(input);
      const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
      expect(section).toBeDefined();
      expect(section?.code?.['@_code']).toEqual(LOINC_NOTES_SECTION);
      const act = section?.entry?.[0]?.act?.[0];
      expect((act?.text as CcdaNarrative)['#text']).toEqual('Lorem ipsum');
    });
  });

  test('should handle practitioner role', () => {
    const input = createCompositionBundle(
      { resourceType: 'Patient' },
      LOINC_NOTES_SECTION,
      {
        resourceType: 'Practitioner',
        id: 'davis',
        name: [{ family: 'Davis', given: ['Albert'] }],
      },
      {
        resourceType: 'Organization',
        id: 'hospital',
        name: 'Hospital',
      },
      {
        resourceType: 'PractitionerRole',
        id: 'role',
        practitioner: { reference: 'Practitioner/davis' },
        organization: { reference: 'Organization/hospital' },
      },
      {
        resourceType: 'ClinicalImpression',
        status: 'completed',
        subject: {
          reference: 'Patient/01953565-5b00-72a8-ac87-3c4b3de1ba88',
          display: 'Alice Jones Newman',
        },
        date: '2015-06-22T07:00:00.000Z',
        assessor: {
          reference: 'PractitionerRole/role',
        },
        summary: 'Lorem ipsum',
      }
    );
    const output = convertFhirToCcda(input);
    const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
    expect(section).toBeDefined();
    expect(section?.code?.['@_code']).toEqual(LOINC_NOTES_SECTION);

    const act = section?.entry?.[0]?.act?.[0];
    expect((act?.text as CcdaNarrative)['#text']).toEqual('Lorem ipsum');

    const author = act?.author?.[0];
    expect(author).toBeDefined();
    expect(author?.assignedAuthor?.assignedPerson?.name?.[0]?.family).toEqual('Davis');
    expect(author?.assignedAuthor?.representedOrganization?.name?.[0]).toEqual('Hospital');
  });

  test('should handle missing author', () => {
    const input = createCompositionBundle({ resourceType: 'Patient' }, LOINC_NOTES_SECTION, {
      resourceType: 'ClinicalImpression',
      status: 'completed',
      subject: {
        reference: 'Patient/01953565-5b00-72a8-ac87-3c4b3de1ba88',
        display: 'Alice Jones Newman',
      },
      date: '2015-06-22T07:00:00.000Z',
      assessor: {
        reference: 'PractitionerRole/role',
      },
      summary: 'Lorem ipsum',
    });
    const output = convertFhirToCcda(input);
    const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
    expect(section).toBeDefined();
    expect(section?.code?.['@_code']).toEqual(LOINC_NOTES_SECTION);

    const act = section?.entry?.[0]?.act?.[0];
    expect((act?.text as CcdaNarrative)['#text']).toEqual('Lorem ipsum');

    const author = act?.author?.[0];
    expect(author).toBeUndefined();
  });
});

describe('Encounters', () => {
  test('should handle diagnosis code', () => {
    const input = createCompositionBundle(
      { resourceType: 'Patient', id: '123' },
      LOINC_ENCOUNTERS_SECTION,
      {
        resourceType: 'Practitioner',
        id: 'davis',
        name: [{ family: 'Davis', given: ['Albert'] }],
      },
      {
        resourceType: 'Condition',
        id: 'diagnosis',
        clinicalStatus: { coding: [{ code: 'active' }] },
        category: [{ coding: [{ code: 'encounter-diagnosis' }] }],
        code: { coding: [{ code: '386661006' }] },
        onsetDateTime: '2011-10-05T07:00:00.000Z',
        recordedDate: '2025-02-24T20:51:00.000Z',
        recorder: { reference: 'Practitioner/davis' },
      },
      {
        resourceType: 'Encounter',
        status: 'finished',
        diagnosis: [{ condition: { reference: 'Condition/diagnosis' } }],
        period: { start: '2015-06-22T20:00:00.000Z', end: '2015-06-22T21:00:00.000Z' },
      }
    );
    const output = convertFhirToCcda(input);
    const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
    expect(section).toBeDefined();
    expect(section?.code?.['@_code']).toEqual(LOINC_ENCOUNTERS_SECTION);

    const encounter = section?.entry?.[0]?.encounter?.[0];
    expect(encounter).toBeDefined();

    const observation = encounter?.entryRelationship?.[0]?.act?.[0]?.entryRelationship?.[0]?.observation;
    expect(observation).toBeDefined();
    expect(observation?.[0]?.code?.['@_code']).toEqual('282291009'); // Diagnostic interpretation
    expect((observation?.[0]?.value as CcdaCode)['@_code']).toEqual('386661006');
  });
});

describe('Reason for Referral', () => {
  test('should handle referral service request', () => {
    const input = createCompositionBundle(
      { resourceType: 'Patient', id: '123' },
      LOINC_REASON_FOR_REFERRAL_SECTION,
      {
        resourceType: 'Practitioner',
        id: 'davis',
        name: [{ family: 'Davis', given: ['Albert'] }],
      },
      {
        resourceType: 'ServiceRequest',
        id: 'referral',
        status: 'active',
        intent: 'order',
        code: { coding: [{ code: '123' }] },
        authoredOn: '2025-02-24T20:51:00.000Z',
        requester: { reference: 'Practitioner/davis' },
        performer: [{ reference: 'Practitioner/davis' }],
        note: [{ text: 'Lorem ipsum' }],
      }
    );

    const output = convertFhirToCcda(input, { type: 'referral' });
    expect(output).toBeDefined();
    expect(output.code?.['@_code']).toEqual(LOINC_REFERRAL_NOTE);

    const section = output.component?.structuredBody?.component?.[0]?.section?.[0];
    expect(section).toBeDefined();
    expect(section?.text).toEqual('Lorem ipsum');
    expect(section?.code?.['@_code']).toEqual(LOINC_REASON_FOR_REFERRAL_SECTION);

    const act = section?.entry?.[0]?.act?.[0];
    expect(act).toBeDefined();
  });
});

function createCompositionBundle(patient: Patient, code?: string, ...resources: Partial<Resource>[]): Bundle {
  for (const resource of resources) {
    resource.id = resource.id ?? generateId();
  }

  const composition: Composition = {
    resourceType: 'Composition',
    status: 'final',
    type: { text: 'test' },
    date: new Date().toISOString(),
    author: [{ display: 'test' }],
    title: 'test',
    subject: createReference(patient),
    section: code
      ? [
          {
            title: 'test',
            code: {
              coding: [
                {
                  code,
                },
              ],
            },
            entry: (resources as WithId<Resource>[])
              .filter((r) => !['Device', 'Location', 'Practitioner'].includes(r.resourceType as string))
              .map(createReference),
          },
        ]
      : [],
  };

  return {
    resourceType: 'Bundle',
    type: 'document',
    entry: [{ resource: composition }, { resource: patient }, ...resources.map((r) => ({ resource: r as Resource }))],
  };
}
