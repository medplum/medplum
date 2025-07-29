import { describe, it, expect } from 'vitest';
import { Patient } from '@medplum/fhirtypes';
import {
  validatePatientDemographics,
  validatePatientIdentifiers,
  validatePatientAddress,
  validatePatientComprehensive,
  createOperationOutcome,
} from './validation-helpers';

describe('Validation Helpers', () => {
  const validPatient: Patient = {
    resourceType: 'Patient',
    id: 'patient-1',
    name: [
      {
        given: ['John'],
        family: 'Doe',
      },
    ],
    birthDate: '1990-01-01',
    gender: 'male',
    telecom: [
      {
        system: 'phone',
        value: '555-1234',
      },
    ],
    address: [
      {
        line: ['123 Main St'],
        city: 'Anytown',
        state: 'CA',
        postalCode: '12345',
      },
    ],
    identifier: [
      {
        system: 'https://hospital.com/mrn',
        value: 'MRN123',
      },
    ],
  };

  describe('validatePatientDemographics', () => {
    it('should pass validation for valid patient', () => {
      const result = validatePatientDemographics(validPatient);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for patient without name', () => {
      const patient = { ...validPatient, name: undefined };
      const result = validatePatientDemographics(patient);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Patient must have at least one name');
    });

    it('should fail validation for patient without first name', () => {
      const patient = {
        ...validPatient,
        name: [{ family: 'Doe' }],
      };
      const result = validatePatientDemographics(patient);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Patient must have a first name');
    });

    it('should fail validation for patient without last name', () => {
      const patient = {
        ...validPatient,
        name: [{ given: ['John'] }],
      };
      const result = validatePatientDemographics(patient);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Patient must have a last name');
    });

    it('should fail validation for patient without birth date', () => {
      const patient = { ...validPatient, birthDate: undefined };
      const result = validatePatientDemographics(patient);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Patient must have a birth date');
    });

    it('should warn for patient without gender', () => {
      const patient = { ...validPatient, gender: undefined };
      const result = validatePatientDemographics(patient);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Patient gender is recommended but not required');
    });

    it('should warn for patient without contact information', () => {
      const patient = { ...validPatient, telecom: undefined };
      const result = validatePatientDemographics(patient);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Patient contact information is recommended');
    });
  });

  describe('validatePatientIdentifiers', () => {
    it('should pass validation for patient with valid identifiers', () => {
      const result = validatePatientIdentifiers(validPatient);
      expect(result.isValid).toBe(true);
    });

    it('should warn for patient without identifiers', () => {
      const patient = { ...validPatient, identifier: undefined };
      const result = validatePatientIdentifiers(patient);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Patient should have at least one identifier');
    });

    it('should warn for patient without MRN', () => {
      const patient = {
        ...validPatient,
        identifier: [
          {
            system: 'https://ssa.gov/ssn',
            value: '123-45-6789',
          },
        ],
      };
      const result = validatePatientIdentifiers(patient);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Medical Record Number (MRN) is recommended');
    });

    it('should warn for patient without SSN', () => {
      const patient = {
        ...validPatient,
        identifier: [
          {
            system: 'https://hospital.com/mrn',
            value: 'MRN123',
          },
        ],
      };
      const result = validatePatientIdentifiers(patient);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Social Security Number is recommended for billing');
    });

    it('should fail validation for identifier without system', () => {
      const patient = {
        ...validPatient,
        identifier: [{ value: 'MRN123' }],
      };
      const result = validatePatientIdentifiers(patient);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('All identifiers must have a system');
    });

    it('should fail validation for identifier without value', () => {
      const patient = {
        ...validPatient,
        identifier: [{ system: 'https://hospital.com/mrn' }],
      };
      const result = validatePatientIdentifiers(patient);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('All identifiers must have a value');
    });
  });

  describe('validatePatientAddress', () => {
    it('should pass validation for patient with valid address', () => {
      const result = validatePatientAddress(validPatient);
      expect(result.isValid).toBe(true);
    });

    it('should warn for patient without address', () => {
      const patient = { ...validPatient, address: undefined };
      const result = validatePatientAddress(patient);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Patient address is recommended');
    });

    it('should warn for address without street information', () => {
      const patient = {
        ...validPatient,
        address: [{ city: 'Anytown', state: 'CA', postalCode: '12345' }],
      };
      const result = validatePatientAddress(patient);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Address should include street information');
    });
  });

  describe('validatePatientComprehensive', () => {
    it('should pass validation for completely valid patient', () => {
      const result = validatePatientComprehensive(validPatient);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for patient with multiple issues', () => {
      const patient = {
        ...validPatient,
        name: undefined,
        birthDate: undefined,
        identifier: undefined,
      };
      const result = validatePatientComprehensive(patient);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Patient must have at least one name');
      expect(result.errors).toContain('Patient must have a birth date');
      expect(result.warnings).toContain('Patient should have at least one identifier');
    });
  });

  describe('createOperationOutcome', () => {
    it('should create OperationOutcome with errors and warnings', () => {
      const validationResult = {
        isValid: false,
        errors: ['Error 1', 'Error 2'],
        warnings: ['Warning 1'],
      };
      const operationOutcome = createOperationOutcome(validationResult);
      
      expect(operationOutcome.resourceType).toBe('OperationOutcome');
      expect(operationOutcome.issue).toHaveLength(3);
      
      const errors = operationOutcome.issue?.filter(issue => issue.severity === 'error');
      const warnings = operationOutcome.issue?.filter(issue => issue.severity === 'warning');
      
      expect(errors).toHaveLength(2);
      expect(warnings).toHaveLength(1);
    });
  });
}); 