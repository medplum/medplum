import { calculateAgeString, HTTP_HL7_ORG } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import {
  getBirthSex,
  getEthnicity,
  getGenderIdentity,
  getGeneralPractitioner,
  getPatientAgeDisplay,
  getRace,
} from './PatientSummary.utils';

jest.mock('@medplum/core', () => ({
  ...jest.requireActual('@medplum/core'),
  calculateAgeString: jest.fn(),
}));

const mockCalculateAgeString = calculateAgeString as jest.Mock;

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

  describe('getPatientAgeDisplay', () => {
    it('should return formatted age when calculateAgeString returns valid age', () => {
      mockCalculateAgeString.mockReturnValue('25');

      const result = getPatientAgeDisplay('1998-01-15');
      expect(result).toBe('25 years old');
      expect(calculateAgeString).toHaveBeenCalledWith('1998-01-15');
    });

    it("should return '0 years old' when calculateAgeString returns null", () => {
      mockCalculateAgeString.mockReturnValue(null);

      const result = getPatientAgeDisplay('invalid-date');
      expect(result).toBe('0 years old');
    });

    it("should return '0 years old' when calculateAgeString returns undefined", () => {
      mockCalculateAgeString.mockReturnValue(undefined);

      const result = getPatientAgeDisplay('invalid-date');
      expect(result).toBe('0 years old');
    });

    it("should return '0 years old' when calculateAgeString returns empty string", () => {
      mockCalculateAgeString.mockReturnValue('');

      const result = getPatientAgeDisplay('invalid-date');
      expect(result).toBe('0 years old');
    });

    it('should handle non-numeric age strings', () => {
      mockCalculateAgeString.mockReturnValue('invalid');

      const result = getPatientAgeDisplay('1990-01-01');
      expect(result).toBe('0 years old');
    });

    it('should handle decimal age strings by parsing integer part', () => {
      mockCalculateAgeString.mockReturnValue('25.5');

      const result = getPatientAgeDisplay('1998-06-15');
      expect(result).toBe('25 years old');
    });

    it('should handle zero age', () => {
      mockCalculateAgeString.mockReturnValue('0');

      const result = getPatientAgeDisplay('2023-12-01');
      expect(result).toBe('0 years old');
    });

    it('should handle large ages', () => {
      mockCalculateAgeString.mockReturnValue('100');

      const result = getPatientAgeDisplay('1923-01-01');
      expect(result).toBe('100 years old');
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
});
