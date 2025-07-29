import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { validatePatientDemographics } from '../shared/validation-helpers';
import { logPatientChange, logMessage } from '../shared/audit-helpers';

/**
 * Resource Sync Bot
 * 
 * This bot demonstrates code reuse by using shared validation and logging functions.
 * It syncs patient data to external systems and validates the data before syncing.
 * 
 * Key features:
 * - Uses shared validation functions from validation-helpers
 * - Uses shared logging functions from audit-helpers
 * - Syncs patient data to external systems
 * - Validates data before syncing
 * 
 * @author Medplum Team
 * @version 1.0.0
 */

/**
 * Syncs patient data to an external system
 * 
 * @param patient - The patient to sync
 * @param system - The external system to sync to
 */
async function syncToExternalSystem(
  patient: Patient,
  system: 'ehr' | 'billing' | 'analytics'
): Promise<void> {
  // In a real implementation, you would sync to the actual external system
  // For this example, we just log the sync operation
  logMessage('info', `Patient synced to ${system} system`, {
    patientId: patient.id,
    patientName: patient.name?.[0]?.given?.[0] + ' ' + patient.name?.[0]?.family,
    system,
    syncTimestamp: new Date().toISOString(),
  });
}

/**
 * Main bot handler function
 * 
 * This bot syncs patient data to external systems using
 * shared validation and logging functions. It validates the data
 * before syncing and logs all sync activities.
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
    logPatientChange(patient, action, `Patient ${action} synced to external systems`);

    // Validate patient demographics before syncing
    const validationResult = validatePatientDemographics(patient);
    
    if (!validationResult.isValid) {
      logMessage('warn', 'Patient validation failed, skipping sync', {
        patientId: patient.id,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      });
      return patient;
    }

    // Sync to different systems based on action type
    if (action === 'create' || action === 'update') {
      // Sync to EHR system
      await syncToExternalSystem(patient, 'ehr');
      
      // Sync to billing system
      await syncToExternalSystem(patient, 'billing');
      
      // Sync to analytics system
      await syncToExternalSystem(patient, 'analytics');
    } else if (action === 'delete') {
      // For deletions, only sync to analytics system for audit purposes
      await syncToExternalSystem(patient, 'analytics');
    }

    // Return the patient unchanged
    return patient;
  } catch (error) {
    // Log any errors that occur during sync processing
    logMessage('error', 'Error in resource sync bot', {
      error: error instanceof Error ? error.message : String(error),
      patientId: patient.id,
    });
    
    // Return the patient even if sync fails to avoid blocking the main workflow
    return patient;
  }
} 