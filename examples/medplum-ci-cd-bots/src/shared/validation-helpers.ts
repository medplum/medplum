import { Patient, OperationOutcome } from '@medplum/fhirtypes';

/**
 * Shared validation helpers for CI/CD bots
 * 
 * This module contains reusable validation functions that can be used
 * across multiple bots to ensure consistent validation logic and
 * reduce code duplication.
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that a patient has required demographic information
 * 
 * @param patient - The patient resource to validate
 * @returns ValidationResult with validation status and any errors/warnings
 */
export function validatePatientDemographics(patient: Patient): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required name information
  if (!patient.name || patient.name.length === 0) {
    errors.push('Patient must have at least one name');
  } else {
    const primaryName = patient.name[0];
    if (primaryName) {
      if (!primaryName.given || primaryName.given.length === 0) {
        errors.push('Patient must have a first name');
      }
      if (!primaryName.family) {
        errors.push('Patient must have a last name');
      }
    }
  }

  // Check for birth date
  if (!patient.birthDate) {
    errors.push('Patient must have a birth date');
  }

  // Check for gender
  if (!patient.gender) {
    warnings.push('Patient gender is recommended but not required');
  }

  // Check for contact information
  if (!patient.telecom || patient.telecom.length === 0) {
    warnings.push('Patient contact information is recommended');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates patient identifiers for completeness and format
 * 
 * @param patient - The patient resource to validate
 * @returns ValidationResult with validation status and any errors/warnings
 */
export function validatePatientIdentifiers(patient: Patient): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!patient.identifier || patient.identifier.length === 0) {
    warnings.push('Patient should have at least one identifier');
    return { isValid: true, errors, warnings };
  }

  // Check for required identifier types
  const hasMRN = patient.identifier.some(id => 
    id.system === 'https://hospital.com/mrn' || 
    id.system?.includes('mrn')
  );
  
  const hasSSN = patient.identifier.some(id => 
    id.system === 'https://ssa.gov/ssn' || 
    id.system?.includes('ssn')
  );

  if (!hasMRN) {
    warnings.push('Medical Record Number (MRN) is recommended');
  }

  if (!hasSSN) {
    warnings.push('Social Security Number is recommended for billing');
  }

  // Validate identifier formats
  for (const identifier of patient.identifier) {
    if (!identifier.system) {
      errors.push('All identifiers must have a system');
    }
    if (!identifier.value) {
      errors.push('All identifiers must have a value');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Creates an OperationOutcome from validation results
 * 
 * @param validationResult - The validation result to convert
 * @returns OperationOutcome with validation issues
 */
export function createOperationOutcome(validationResult: ValidationResult): OperationOutcome {
  const issues: OperationOutcome['issue'] = [];

  // Add errors
  for (const error of validationResult.errors) {
    issues.push({
      severity: 'error',
      code: 'invalid',
      diagnostics: error,
    });
  }

  // Add warnings
  for (const warning of validationResult.warnings) {
    issues.push({
      severity: 'warning',
      code: 'informational',
      diagnostics: warning,
    });
  }

  return {
    resourceType: 'OperationOutcome',
    issue: issues,
  };
}

/**
 * Validates patient address information
 * 
 * @param patient - The patient resource to validate
 * @returns ValidationResult with validation status and any errors/warnings
 */
export function validatePatientAddress(patient: Patient): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!patient.address || patient.address.length === 0) {
    warnings.push('Patient address is recommended');
    return { isValid: true, errors, warnings };
  }

  for (const address of patient.address) {
    if (!address.line || address.line.length === 0) {
      warnings.push('Address should include street information');
    }
    if (!address.city) {
      warnings.push('Address should include city');
    }
    if (!address.state) {
      warnings.push('Address should include state');
    }
    if (!address.postalCode) {
      warnings.push('Address should include postal code');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Comprehensive patient validation that combines all validation functions
 * 
 * @param patient - The patient resource to validate
 * @returns ValidationResult with all validation issues
 */
export function validatePatientComprehensive(patient: Patient): ValidationResult {
  const demographicResult = validatePatientDemographics(patient);
  const identifierResult = validatePatientIdentifiers(patient);
  const addressResult = validatePatientAddress(patient);

  const allErrors = [
    ...demographicResult.errors,
    ...identifierResult.errors,
    ...addressResult.errors,
  ];

  const allWarnings = [
    ...demographicResult.warnings,
    ...identifierResult.warnings,
    ...addressResult.warnings,
  ];

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
} 