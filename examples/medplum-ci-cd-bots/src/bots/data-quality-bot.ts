import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { 
  validatePatientComprehensive, 
  validatePatientIdentifiers,
  ValidationResult 
} from '../shared/validation-helpers';
import { logMessage, logPatientChange } from '../shared/audit-helpers';

/**
 * Data Quality Bot
 * 
 * This bot demonstrates code reuse by using multiple shared functions.
 * It performs comprehensive data quality checks and generates quality reports.
 * 
 * Key features:
 * - Uses multiple shared validation functions
 * - Uses shared logging functions
 * - Performs comprehensive data quality analysis
 * - Generates quality reports
 * 
 * @author Medplum Team
 * @version 1.0.0
 */

/**
 * Generates a data quality report for a patient
 * 
 * @param patient - The patient to analyze
 * @param validationResults - The validation results
 * @returns Quality report object
 */
function generateQualityReport(
  patient: Patient,
  validationResults: ValidationResult[]
): Record<string, any> {
  const totalChecks = validationResults.length;
  const passedChecks = validationResults.filter(r => r.isValid).length;
  const qualityScore = (passedChecks / totalChecks) * 100;

  const allErrors = validationResults.flatMap(r => r.errors);
  const allWarnings = validationResults.flatMap(r => r.warnings);

  return {
    patientId: patient.id,
    patientName: patient.name?.[0]?.given?.[0] + ' ' + patient.name?.[0]?.family,
    qualityScore: Math.round(qualityScore * 100) / 100,
    totalChecks,
    passedChecks,
    failedChecks: totalChecks - passedChecks,
    errors: allErrors,
    warnings: allWarnings,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Main bot handler function
 * 
 * This bot performs comprehensive data quality analysis using
 * multiple shared functions. It generates quality reports and
 * logs the results for tracking.
 * 
 * @param _medplum - The Medplum client (unused in this implementation)
 * @param event - The bot event containing patient data and headers
 * @returns Promise that resolves to the patient unchanged
 */
export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<Patient> {
  const patient = event.input as Patient;

  try {
    // Determine the action type based on headers
    let action: 'create' | 'update' | 'delete' = 'update';
    
    if (event.headers?.['X-Medplum-Deleted-Resource']) {
      action = 'delete';
    } else if (event.headers?.['X-Medplum-New-Resource']) {
      action = 'create';
    }

    // Log the patient change using shared function
    logPatientChange(patient, action, `Data quality analysis performed`);

    // Perform multiple validation checks using shared functions
    const comprehensiveValidation = validatePatientComprehensive(patient);
    const identifierValidation = validatePatientIdentifiers(patient);

    const validationResults = [comprehensiveValidation, identifierValidation];

    // Generate quality report
    const qualityReport = generateQualityReport(patient, validationResults);

    // Log the quality report
    logMessage('info', 'Data quality analysis completed', qualityReport);

    // If quality score is below threshold, log a warning
    if (qualityReport['qualityScore'] < 80) {
      logMessage('warn', 'Patient data quality below threshold', {
        patientId: patient.id,
        qualityScore: qualityReport['qualityScore'],
        errors: qualityReport['errors'],
        warnings: qualityReport['warnings'],
      });
    }

    // In a real implementation, you might store the quality report
    // or send it to a monitoring system
    console.log('Quality Report:', JSON.stringify(qualityReport, null, 2));

    // Return the patient unchanged
    return patient;
  } catch (error) {
    // Log any errors that occur during quality analysis
    logMessage('error', 'Error in data quality bot', {
      error: error instanceof Error ? error.message : String(error),
      patientId: patient.id,
    });
    
    // Return the patient even if quality analysis fails
    return patient;
  }
} 