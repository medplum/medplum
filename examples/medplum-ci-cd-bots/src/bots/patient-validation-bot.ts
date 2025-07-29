import { BotEvent, MedplumClient, OperationOutcomeError } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { 
  validatePatientComprehensive, 
  createOperationOutcome,
  ValidationResult 
} from '../shared/validation-helpers';
import { logValidationResult, logError } from '../shared/audit-helpers';

/**
 * Patient Validation Bot
 * 
 * This bot demonstrates code reuse by using shared validation helpers.
 * It validates patient data and returns appropriate error messages
 * when validation fails.
 * 
 * Key features:
 * - Uses shared validation logic from validation-helpers
 * - Comprehensive validation of demographics, identifiers, and addresses
 * - Consistent error reporting through OperationOutcome
 * - Structured logging for audit purposes
 * 
 * @author Medplum Team
 * @version 1.0.0
 */

/**
 * Main bot handler function
 * 
 * This bot validates patient data using shared validation functions
 * and returns appropriate error messages when validation fails.
 * 
 * @param _medplum - The Medplum client (unused in this implementation)
 * @param event - The bot event containing patient data
 * @returns Promise that resolves to the patient or throws OperationOutcomeError
 */
export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<Patient> {
  const patient = event.input as Patient;

  try {
    // Use shared validation function
    const validationResult: ValidationResult = validatePatientComprehensive(patient);
    
    // Log validation results for audit purposes
    logValidationResult(patient, validationResult);

    // If validation fails, throw an OperationOutcomeError
    if (!validationResult.isValid) {
      const operationOutcome = createOperationOutcome(validationResult);
      throw new OperationOutcomeError(operationOutcome);
    }

    // If validation passes, return the patient unchanged
    return patient;
  } catch (error) {
    // Log any unexpected errors
    if (!(error instanceof OperationOutcomeError)) {
      logError(error as Error, {
        botName: 'patient-validation-bot',
        patientId: patient.id,
      });
    }
    throw error;
  }
} 