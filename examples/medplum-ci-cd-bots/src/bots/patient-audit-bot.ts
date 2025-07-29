import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { createPatientAuditEvent, logPatientChange } from '../shared/audit-helpers';

/**
 * Patient Audit Bot
 * 
 * This bot demonstrates code reuse by using shared audit helpers.
 * It creates audit events and logs patient changes for compliance
 * and tracking purposes.
 * 
 * Key features:
 * - Uses shared audit functions from audit-helpers
 * - Creates standardized audit events for patient changes
 * - Logs patient changes with consistent formatting
 * - Supports different types of patient operations
 * 
 * @author Medplum Team
 * @version 1.0.0
 */

/**
 * Main bot handler function
 * 
 * This bot creates audit events and logs patient changes using
 * shared audit functions. It determines the action type based on
 * the event headers and creates appropriate audit records.
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

    // Create audit event using shared function
    const context: Record<string, string | undefined> = {};
    if (event.headers?.['X-Medplum-User-Id']) {
      context['userId'] = event.headers['X-Medplum-User-Id'] as string;
    }
    if (event.headers?.['User-Agent']) {
      context['userAgent'] = event.headers['User-Agent'] as string;
    }
    if (event.headers?.['X-Forwarded-For']) {
      context['ipAddress'] = event.headers['X-Forwarded-For'] as string;
    }
    
    const auditEvent = createPatientAuditEvent(patient, action, context);

    // Log the patient change using shared function
    logPatientChange(patient, action, `Patient ${action} processed by audit bot`);

    // In a real implementation, you might save the audit event to the database
    // For this example, we just log it
    console.log('Audit Event Created:', JSON.stringify(auditEvent, null, 2));

    // Return the patient unchanged
    return patient;
  } catch (error) {
    // Log any errors that occur during audit processing
    console.error('Error in patient audit bot:', error);
    
    // Return the patient even if audit fails to avoid blocking the main workflow
    return patient;
  }
} 