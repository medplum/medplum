// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HTTP_HL7_ORG } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import {
  formatPatientGenderDisplay,
  formatPatientRaceEthnicityDisplay,
  getBirthSex,
  getEthnicity,
  getGenderIdentity,
  getGeneralPractitioner,
  getPreferredLanguage,
  getRace,
} from './PatientSummary.utils';

describe('Patient Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGenderIdentity', () => {
    it('should return gender identity display when extension exists', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
            valueCodeableConcept: {
              coding: [
                {
                  display: 'Non-binary',
                  code: 'LA22878-5',
                  system: 'http://loinc.org',
                },
              ],
            },
          },
        ],
      };

      const result = getGenderIdentity(patient);
      expect(result).toBe('Non-binary');
    });

    it('should return undefined when gender identity extension does not exist', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [],
      };

      const result = getGenderIdentity(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when patient has no extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };

      const result = getGenderIdentity(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when valueCodeableConcept is missing', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
          },
        ],
      };

      const result = getGenderIdentity(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when coding array is empty', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
            valueCodeableConcept: {
              coding: [],
            },
          },
        ],
      };

      const result = getGenderIdentity(patient);
      expect(result).toBeUndefined();
    });
  });

  describe('getBirthSex', () => {
    it('should return birth sex value when extension exists', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
            valueCode: 'F',
          },
        ],
      };

      const result = getBirthSex(patient);
      expect(result).toBe('F');
    });

    it('should return undefined when birth sex extension does not exist', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [],
      };

      const result = getBirthSex(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when patient has no extensions', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };

      const result = getBirthSex(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when valueCode is missing', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
          },
        ],
      };

      const result = getBirthSex(patient);
      expect(result).toBeUndefined();
    });
  });

  describe('getRace', () => {
    it('should return race display when extension exists with ombCategory', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  display: 'Asian',
                  code: '2028-9',
                  system: 'urn:oid:2.16.840.1.113883.6.238',
                },
              },
            ],
          },
        ],
      };

      const result = getRace(patient);
      expect(result).toBe('Asian');
    });

    it('should return undefined when race extension does not exist', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [],
      };

      const result = getRace(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when ombCategory sub-extension is missing', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
            extension: [
              {
                url: 'text',
                valueString: 'Asian',
              },
            ],
          },
        ],
      };

      const result = getRace(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when valueCoding is missing', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
            extension: [
              {
                url: 'ombCategory',
              },
            ],
          },
        ],
      };

      const result = getRace(patient);
      expect(result).toBeUndefined();
    });
  });

  describe('getEthnicity', () => {
    it('should return ethnicity display when extension exists with ombCategory', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  display: 'Hispanic or Latino',
                  code: '2135-2',
                  system: 'urn:oid:2.16.840.1.113883.6.238',
                },
              },
            ],
          },
        ],
      };

      const result = getEthnicity(patient);
      expect(result).toBe('Hispanic or Latino');
    });

    it('should return undefined when ethnicity extension does not exist', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [],
      };

      const result = getEthnicity(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when ombCategory sub-extension is missing', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
            extension: [
              {
                url: 'text',
                valueString: 'Hispanic or Latino',
              },
            ],
          },
        ],
      };

      const result = getEthnicity(patient);
      expect(result).toBeUndefined();
    });
  });

  describe('getGeneralPractitioner', () => {
    it('should return general practitioner display when it exists', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        generalPractitioner: [
          {
            reference: 'Practitioner/123',
            display: 'Dr. John Smith',
          },
        ],
      };

      const result = getGeneralPractitioner(patient);
      expect(result).toBe('Dr. John Smith');
    });

    it('should return undefined when generalPractitioner array is empty', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        generalPractitioner: [],
      };

      const result = getGeneralPractitioner(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when generalPractitioner is not present', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };

      const result = getGeneralPractitioner(patient);
      expect(result).toBeUndefined();
    });

    it('should return undefined when first practitioner has no display', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        generalPractitioner: [
          {
            reference: 'Practitioner/123',
          },
        ],
      };

      const result = getGeneralPractitioner(patient);
      expect(result).toBeUndefined();
    });
  });

  describe('Integration tests with multiple extensions', () => {
    it('should handle patient with all extensions present', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
            valueCodeableConcept: {
              coding: [{ display: 'Female' }],
            },
          },
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
            valueCode: 'F',
          },
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: { display: 'White' },
              },
            ],
          },
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: { display: 'Not Hispanic or Latino' },
              },
            ],
          },
        ],
        generalPractitioner: [
          {
            display: 'Dr. Jane Doe',
          },
        ],
      };

      expect(getGenderIdentity(patient)).toBe('Female');
      expect(getBirthSex(patient)).toBe('F');
      expect(getRace(patient)).toBe('White');
      expect(getEthnicity(patient)).toBe('Not Hispanic or Latino');
      expect(getGeneralPractitioner(patient)).toBe('Dr. Jane Doe');
    });

    it('should handle patient with mixed extension presence', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
            valueCode: 'M',
          },
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: { display: 'Black or African American' },
              },
            ],
          },
        ],
      };

      expect(getGenderIdentity(patient)).toBeUndefined();
      expect(getBirthSex(patient)).toBe('M');
      expect(getRace(patient)).toBe('Black or African American');
      expect(getEthnicity(patient)).toBeUndefined();
      expect(getGeneralPractitioner(patient)).toBeUndefined();
    });
  });

  describe('Patient Gender Display', () => {
    it('should format patient gender display with all fields present', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        gender: 'female',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
            valueCodeableConcept: {
              coding: [{ display: 'Female' }],
            },
          },
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
            valueCode: 'F',
          },
        ],
      };

      expect(formatPatientGenderDisplay(patient)).toBe('Female · Female · Born as F');
    });

    it('should format patient gender display with only gender present', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        gender: 'male',
      };

      expect(formatPatientGenderDisplay(patient)).toBe('Male');
    });

    it('should format patient gender display with gender and gender identity', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        gender: 'male',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
            valueCodeableConcept: {
              coding: [{ display: 'Male' }],
            },
          },
        ],
      };

      expect(formatPatientGenderDisplay(patient)).toBe('Male · Male');
    });

    it('should format patient gender display with gender and birth sex', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        gender: 'male',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
            valueCode: 'M',
          },
        ],
      };

      expect(formatPatientGenderDisplay(patient)).toBe('Male · Born as M');
    });

    it('should return empty string for patient with no gender information', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };

      expect(formatPatientGenderDisplay(patient)).toBe('');
    });
  });

  describe('Patient Race Ethnicity Display', () => {
    it('should format patient race ethnicity display with only race present', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: { display: 'White' },
              },
            ],
          },
        ],
      };

      expect(formatPatientRaceEthnicityDisplay(patient)).toBe('White');
    });

    it('should format patient race ethnicity display with only ethnicity present', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: { display: 'Hispanic or Latino' },
              },
            ],
          },
        ],
      };

      expect(formatPatientRaceEthnicityDisplay(patient)).toBe('Hispanic or Latino');
    });

    it('should format patient race ethnicity display with both race and ethnicity present', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: { display: 'White' },
              },
            ],
          },
          {
            url: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`,
            extension: [
              {
                url: 'ombCategory',
                valueCoding: { display: 'Hispanic or Latino' },
              },
            ],
          },
        ],
      };

      expect(formatPatientRaceEthnicityDisplay(patient)).toBe('White · Hispanic or Latino');
    });

    it('should return empty string for patient with no race or ethnicity information', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };

      expect(formatPatientRaceEthnicityDisplay(patient)).toBe('');
    });
  });

  describe('Preferred Language', () => {
    it('should return preferred language display when preferred communication exists', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        communication: [
          {
            preferred: true,
            language: {
              coding: [
                {
                  display: 'English',
                  code: 'en',
                  system: 'urn:ietf:bcp:47',
                },
              ],
            },
          },
        ],
      };

      expect(getPreferredLanguage(patient)).toBe('English');
    });

    it('should return first language display when no preferred communication exists', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        communication: [
          {
            language: {
              coding: [
                {
                  display: 'Spanish',
                  code: 'es',
                  system: 'urn:ietf:bcp:47',
                },
              ],
            },
          },
        ],
      };

      expect(getPreferredLanguage(patient)).toBe('Spanish');
    });

    it('should return undefined when no communication exists', () => {
      const patient: Patient = {
        resourceType: 'Patient',
      };

      expect(getPreferredLanguage(patient)).toBeUndefined();
    });
  });
});
